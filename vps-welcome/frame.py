"""An isolated tmux viewport keeps the HN frame outside application output."""
import os
from pathlib import Path
import shlex
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time

CONFIG = '''
set -g status off
set -g prefix None
unbind-key C-b
set -g mouse off
set -g default-terminal tmux-256color
set -g escape-time 10
set -g history-limit 20000
set -g set-titles off
set -g exit-empty on
set -g exit-unattached off
set -g pane-border-style fg=#605071,bg=#100d1c
set -g pane-active-border-style fg=#c5a4ff,bg=#100d1c
set -g window-style bg=#100d1c,fg=#f5efff
set -g window-active-style bg=#100d1c,fg=#f5efff
set -g pane-border-lines single
set -g remain-on-exit on
# A dedicated copy-mode key preserves ordinary command/application keys.
bind-key -n F8 copy-mode
'''


def create_frame(tmux, command, columns=100, rows=30):
    def call(*args):
        return subprocess.check_output(tmux + list(args), text=True).strip()
    centre = call('new-session', '-d', '-s', 'hn', '-x', str(columns), '-y', str(rows),
                  '-P', '-F', '#{pane_id}', shlex.join(command))
    decoration = [sys.executable, str(Path(__file__).resolve()), '--decoration']
    header = call('split-window', '-P', '-F', '#{pane_id}', '-t', centre, '-v', '-b', '-l', '3', shlex.join(decoration + ['header']))
    footer = call('split-window', '-P', '-F', '#{pane_id}', '-t', centre, '-v', '-l', '1', shlex.join(decoration + ['footer']))
    left = call('split-window', '-P', '-F', '#{pane_id}', '-t', centre, '-h', '-b', '-l', '1', shlex.join(decoration + ['side']))
    right = call('split-window', '-P', '-F', '#{pane_id}', '-t', centre, '-h', '-l', '1', shlex.join(decoration + ['side']))
    resize = '; '.join(['resize-pane -t ' + header + ' -y 3', 'resize-pane -t ' + footer + ' -y 1',
                        'resize-pane -t ' + left + ' -x 1', 'resize-pane -t ' + right + ' -x 1'])
    call('set-hook', '-t', 'hn', 'client-resized', resize)
    call('set-hook', '-t', 'hn', 'after-resize-window', resize)
    leave = shlex.join([sys.executable, str(Path(__file__).resolve()), '--leave-codex', centre])
    call('bind-key', '-n', 'F9', 'run-shell', leave)
    call('select-pane', '-t', centre)
    # Exiting the actual shell closes its frame and decorative panes too.
    call('set-hook', '-g', 'pane-died',
         'if-shell -F "#{==:#{hook_pane},' + centre + '}" "kill-session -t hn"')
    return centre


def launch(show_menu=True):
    if not shutil.which('tmux'):
        print('HN terminal frame needs tmux. Opening the normal terminal instead.')
        return None
    columns, rows = shutil.get_terminal_size((100, 30))
    if columns < 42 or rows < 15:
        print('Enlarge the terminal to at least 42 columns × 15 rows for the HN frame.')
        return None
    with tempfile.TemporaryDirectory(prefix='hn-terminal-') as directory:
        config = Path(directory) / 'tmux.conf'
        config.write_text(CONFIG)
        tmux = ['tmux', '-S', str(Path(directory) / 'socket'), '-f', str(config)]
        try:
            command = ['env', 'HN_HORIZON_FRAME_ACTIVE=1', sys.executable,
                       str(Path(__file__).resolve().with_name('horizon.py')), '--session' if show_menu else '--shell']
            # Draw the menu only after the viewport has its final dimensions.
            ready = Path(directory) / 'ready'
            gate = ['sh', '-c', 'while [ ! -f ' + shlex.quote(str(ready)) + ' ]; do sleep .02; done; exec ' + shlex.join(command)]
            create_frame(tmux, gate, columns, rows)
            ready.touch()
            # Ignore an inherited tmux environment: this frame belongs only to this SSH session.
            environment = {k: v for k, v in os.environ.items() if k not in ('TMUX', 'TMUX_PANE')}
            return subprocess.run(tmux + ['attach-session', '-t', 'hn'], env=environment, check=False).returncode
        finally:
            subprocess.run(tmux + ['kill-server'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


def decoration(role):
    signal.signal(signal.SIGWINCH, lambda *_: draw_decoration(role))
    draw_decoration(role)
    while True:
        time.sleep(3600)


def draw_decoration(role):
    print('\033[?25l\033[2J\033[H', end='')
    if role == 'header':
        print('\033[1;38;2;197;164;255m  HN Group\033[0m  /  SECURE ACCESS TERMINAL')
        print('\033[38;2;62;155;163m  ━━━━━\033[38;2;233;125;232m━━━━\033[38;2;227;230;91m━━\033[38;2;95;174;123m━━━━\033[0m')
        print('  ' + socket.gethostname() + ' · ' + os.environ.get('USER', 'root'), end='')
    elif role == 'footer':
        print('\033[38;2;184;171;201m  F9 · leave Codex    F8 · scrollback    horizon · menu\033[0m', end='')
    sys.stdout.flush()


if __name__ == '__main__' and len(sys.argv) == 3 and sys.argv[1] == '--decoration':
    decoration(sys.argv[2])


def leave_codex(pane):
    """Signal only the registered Horizon runner in this tmux pane."""
    if not pane.startswith('%') or not pane[1:].isdigit():
        return
    result = subprocess.run(['tmux', 'show-options', '-pqv', '-t', pane, '@hn-codex-runner'],
                            capture_output=True, text=True, check=False)
    pid = result.stdout.strip()
    if result.returncode == 0 and pid.isdigit() and int(pid) > 1:
        try:
            os.kill(int(pid), signal.SIGUSR1)
        except ProcessLookupError:
            pass


if __name__ == '__main__' and len(sys.argv) == 3 and sys.argv[1] == '--leave-codex':
    leave_codex(sys.argv[2])
