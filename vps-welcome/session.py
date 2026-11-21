"""PTY bridge: reopen Horizon after idle keyboard input at a Bash prompt only."""
import errno
import fcntl
import os
from pathlib import Path
import pty
import select
import signal
import struct
import sys
import termios
import time
import tty

MARKER = b'\033]777;hn-prompt-ready\007'


def shell_is_idle(at_prompt, master, shell_pid):
    """Never show the idle menu over Codex or another foreground job."""
    if not at_prompt:
        return False
    try:
        return os.tcgetpgrp(master) == shell_pid
    except OSError:
        return False


def session(menu, logout_code, timeout=120, rcfile=None, show_menu=True):
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        return 1
    if rcfile is None and os.environ.get('HN_HORIZON_FRAME_ACTIVE') != '1':
        from frame import launch
        result = launch(show_menu=show_menu)
        if result is not None:
            return result
    if show_menu and menu([]) == logout_code:
        return 0
    rcfile = rcfile or Path(__file__).resolve().with_name('session.bash')
    original = termios.tcgetattr(0)
    pid, master = pty.fork()
    if pid == 0:
        os.environ['HN_HORIZON_SHOWN'] = '1'
        os.execv('/bin/bash', ['bash', '--noprofile', '--rcfile', str(rcfile), '-i'])
    def resize(*_):
        try:
            fcntl.ioctl(master, termios.TIOCSWINSZ, fcntl.ioctl(0, termios.TIOCGWINSZ, struct.pack('HHHH', 0, 0, 0, 0)))
        except OSError:
            pass
    previous = signal.signal(signal.SIGWINCH, resize)
    def terminate(*_):
        raise SystemExit(0)
    old_term = signal.signal(signal.SIGTERM, terminate)
    at_prompt, pending, last_input = False, b'', time.monotonic()
    try:
        resize()
        tty.setraw(0)
        while True:
            readable, _, _ = select.select([0, master], [], [], .2)
            if master in readable:
                try:
                    chunk = os.read(master, 65536)
                except OSError as error:
                    if error.errno == errno.EIO: break
                    raise
                if not chunk: break
                pending += chunk
                while MARKER in pending:
                    before, pending = pending.split(MARKER, 1)
                    os.write(1, before)
                    at_prompt, last_input = True, time.monotonic()
                # Keep only a possible split marker, forwarding other output immediately.
                keep = 0
                for size in range(1, min(len(pending), len(MARKER) - 1) + 1):
                    if pending.endswith(MARKER[:size]): keep = size
                if len(pending) > keep:
                    os.write(1, pending[:-keep] if keep else pending)
                pending = pending[-keep:] if keep else b''
            if 0 in readable:
                data = os.read(0, 65536)
                if not data: break
                last_input = time.monotonic()
                if b'\r' in data or b'\n' in data or b'\x04' in data:
                    at_prompt = False
                os.write(master, data)
            if shell_is_idle(at_prompt, master, pid) and time.monotonic() - last_input >= timeout:
                termios.tcsetattr(0, termios.TCSADRAIN, original)
                print('\n\n  Your terminal has been idle for two minutes.\n', flush=True)
                try:
                    if menu([]) == logout_code:
                        break
                finally:
                    tty.setraw(0)
                last_input = time.monotonic()
                # Readline redraws the existing command buffer; do not execute or discard it.
                os.write(master, b'\x0c')
    finally:
        termios.tcsetattr(0, termios.TCSADRAIN, original)
        signal.signal(signal.SIGWINCH, previous)
        signal.signal(signal.SIGTERM, old_term)
        os.close(master)
        try: os.kill(pid, signal.SIGHUP)
        except ProcessLookupError: pass
        try: os.waitpid(pid, 0)
        except ChildProcessError: pass
    return 0
