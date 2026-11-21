#!/usr/bin/env python3
"""HN Group VPS welcome and fixed, reviewable operational shortcuts. Standard library only."""
import argparse
import getpass
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import shlex
import shutil
import socket
import signal
import subprocess
import sys
import time
import urllib.request
import urllib.error

REPO = Path('/root/HorizonNetwork')
FALLBACK = Path(__file__).resolve().with_name('catalog.json')
RESET = '\033[0m'
PIN_FILE = Path('/etc/hn-horizon/admin-pin.json')


def pin_prompt(attempt=0):
    clear_display()
    width = max(24, min(terminal_size().columns - 2, 64))
    inner = width - 2
    def row(text='', style=''):
        text = '  ' + text[:inner - 4].ljust(inner - 2)
        return colour('│', '38;5;60') + (colour(text, style) if style else text) + colour('│', '38;5;60')
    lines = [colour('╭' + '─' * inner + '╮', '38;5;141'),
             row('HN GROUP / SYSTEM ACCESS', '1;38;5;183'),
             row('System admin PIN', '1;38;5;183'),
             row(), row('PIN ›'), row(),
             row('Incorrect PIN. Please try again.' if attempt else 'Enter your PIN to unlock these controls.', '38;5;211' if attempt else '2'),
             row('Input is hidden.  B + Enter to go back.', '38;5;73'),
             colour('╰' + '─' * inner + '╯', '38;5;141')]
    print('\n' + '\n'.join(lines), flush=True)
    positioned = sys.stdout.isatty() and os.environ.get('TERM', 'dumb') != 'dumb'
    if positioned:
        # Put the hidden entry inside the already drawn input row.
        print('\033[5A\033[11G', end='', flush=True)
    try:
        return getpass.getpass('' if positioned else '  PIN › ', stream=sys.stdout)
    finally:
        if positioned:
            print('\033[4B\r', end='', flush=True)


def unlock_pm2():
    if not sys.stdin.isatty():
        print('Open an interactive terminal to unlock PM2 controls.')
        return False
    try:
        record = json.loads(PIN_FILE.read_text())
        salt = bytes.fromhex(record['salt'])
        expected = record['hash']
        for attempt in range(3):
            pin = pin_prompt(attempt)
            if pin.lower() == 'b':
                return False
            actual = hashlib.pbkdf2_hmac('sha256', pin.encode(), salt, 200000).hex()
            if hmac.compare_digest(actual, expected):
                return True
            print('  Incorrect PIN.')
        print('  PM2 controls remain locked.')
    except (OSError, ValueError, KeyError, EOFError, KeyboardInterrupt):
        print('\n  PM2 controls are locked. PIN verification was unavailable.')
    return False


def colour(text, code):
    return '\033[' + code + 'm' + text + RESET if sys.stdout.isatty() and os.environ.get('TERM') != 'dumb' and 'NO_COLOR' not in os.environ else text


def catalog():
    for source in (REPO / 'admin-site/catalog.json', FALLBACK):
        try:
            records = json.loads(source.read_text())
            result = {row['process']: row['name'] for row in records
                      if isinstance(row, dict) and isinstance(row.get('process'), str)
                      and isinstance(row.get('name'), str) and row['process'].startswith(('hn-', 'ha-'))
                      and all(c.isalnum() or c in '-_' for c in row['process'])}
            if result:
                result['hn-accounts'] = 'Private staff-account backend'
                result['hn-admin'] = 'HN Group Administration'
                return result
        except (OSError, ValueError, TypeError, KeyError):
            pass
    return {'hn-accounts': 'Private staff-account backend'}


def run_framed_codex(argv, cwd):
    """F9 ends only this Codex child, keeping the SSH session and menu alive."""
    class LeaveCodex(Exception):
        pass
    def leave(*_):
        raise LeaveCodex()
    pane = os.environ['TMUX_PANE']
    process = subprocess.Popen(argv, cwd=cwd)
    previous = signal.signal(signal.SIGUSR1, leave)
    try:
        subprocess.run(['tmux', 'set-option', '-p', '-t', pane, '@hn-codex-runner', str(os.getpid())],
                       check=True, stdout=subprocess.DEVNULL)
        return process.wait()
    except (LeaveCodex, KeyboardInterrupt):
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        # Restore terminal modes even if Codex exits while in its full-screen view.
        subprocess.run(['stty', 'sane'], check=False)
        print('\033[?1049l\033[?25h', end='', flush=True)
        return 0
    finally:
        subprocess.run(['tmux', 'set-option', '-pu', '-t', pane, '@hn-codex-runner'],
                       check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        signal.signal(signal.SIGUSR1, previous)
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


def run(argv, cwd=None):
    print(colour('$ ' + shlex.join(argv), '2'), flush=True)
    if not shutil.which(argv[0]):
        print('The command is not installed: ' + argv[0], file=sys.stderr)
        return 1
    if argv[0] == "codex" and os.environ.get("TMUX_PANE"):
        return run_framed_codex(argv, cwd)
    try:
        return subprocess.run(argv, cwd=cwd, check=False).returncode
    except OSError as error:
        print(str(error), file=sys.stderr)
        return 1


def confirm(description):
    if not sys.stdin.isatty():
        print('Run this shortcut in an interactive terminal so you can confirm it.', file=sys.stderr)
        return False
    try:
        return input(description + ' [1 = continue, 0 = cancel] ').strip() == '1'
    except (EOFError, KeyboardInterrupt):
        return False


def metrics():
    try:
        uptime = int(float(Path('/proc/uptime').read_text().split()[0]))
        days, remainder = divmod(uptime, 86400)
        hours, remainder = divmod(remainder, 3600)
        up = (str(days) + 'd ' if days else '') + str(hours) + 'h ' + str(remainder // 60) + 'm'
        memory = {line.split(':')[0]: int(line.split()[1]) for line in Path('/proc/meminfo').read_text().splitlines() if ':' in line and line.split()[1].isdigit()}
        used = (memory['MemTotal'] - memory['MemAvailable']) / memory['MemTotal'] * 100
        disk = shutil.disk_usage('/')
        return up, '{:.0f}%'.format(used), '{:.0f}%'.format(disk.used / disk.total * 100)
    except (OSError, KeyError, ValueError):
        return 'unavailable', 'unavailable', 'unavailable'


ACTIONS = [
    ('1', 'status', 'Website process status', 'pm2 ls'),
    ('2', 'update', 'Update changed HN websites', 'cd /root/HorizonNetwork && git pull && sudo bash install.sh'),
    ('3', 'logs', 'Read one website’s logs', 'pm2 logs <website-process> --lines 80'),
    ('4', 'nginx-check', 'Check nginx configuration', 'nginx -t'),
    ('5', 'nginx-reload', 'Check and reload nginx', 'nginx -t && systemctl reload nginx'),
    ('6', 'vpn', 'WireGuard connection status', 'wg show wg-hn'),
    ('7', 'resources', 'Server memory, disk and uptime', 'uptime · free -h · df -h /'),
    ('8', 'git', 'Repository status and latest commit', 'git status --short --branch · git log -1 --oneline'),
]


MENU = [
    ('1', 'terminal', 'Open terminal', 'Your server shell, ready to work.'),
    ('2', 'codex', 'Open Codex', 'Continue in the HorizonNetwork project.'),
    ('3', 'pm2', 'PM2 process controls', 'Start or stop all managed services.'),
    ('4', 'power', 'Power management', 'Restart, shut down or power up.'),
    ('5', 'unlock-account', 'Unlock an HN account', 'Enter the account’s sign-in email.'),
]
PM2_MENU = [
    ('1', 'start-all', 'Start all PM2 processes', 'pm2 start all'),
    ('2', 'stop-all', 'Stop all PM2 processes', 'pm2 stop all'),
    ('3', 'sites', 'Individual sites', 'Search for a site, then manage its process.'),
]
POWER_MENU = [
    ('1', 'restart-server', 'Restart server', 'Reboot the VPS and disconnect this session.'),
    ('2', 'soft-shutdown', 'Soft shutdown', 'Stop PM2, VPN and active SSH sessions.'),
    ('3', 'power-up', 'Power up', 'Start the VPN and all PM2 processes.'),
    ('4', 'shutdown-server', 'Shutdown server', 'Power off the VPS. Start it again from the hosting control panel.'),
]
LOGOUT = 10  # The terminal bridge or child shell handles logout; never signal a parent shell.


def terminal_size():
    try:
        return os.get_terminal_size(sys.stdout.fileno())
    except (OSError, ValueError, TypeError, AttributeError, io.UnsupportedOperation):
        return shutil.get_terminal_size((88, 30))


def clear_display():
    if sys.stdout.isatty() and os.environ.get('TERM', 'dumb') != 'dumb':
        # Reset the scroll region before drawing, including after fullscreen applications.
        print('\033[r\033[0m\033[?25h\033[H\033[2J', end='', flush=True)


def welcome(pm2=False, power=False):
    columns, rows = terminal_size()
    framed = os.environ.get('HN_HORIZON_FRAME_ACTIVE') == '1'
    compact = framed or rows < 28
    width = max(20, min(columns - 2, columns - 2 if framed else 80))
    inner = width - 2
    clear_display()
    def line(text='', style=None):
        text = text[:inner - 4]
        content = '  ' + text.ljust(inner - 2)
        if framed:
            print(colour(content, style) if style else content)
        else:
            print(colour('│', '38;5;60') + (colour(content, style) if style else content) + colour('│', '38;5;60'))
    def centre(text, style):
        line(text.center(inner - 4), style)
    if not framed:
        print(colour('╭' + '─' * inner + '╮', '38;5;141'))
    if not compact:
        line()
    logo = r""" _   _ _   _    ____
| | | | \ | |  / ___|_ __ ___  _   _ _ __
| |_| |  \| | | |  _| '__/ _ \| | | | '_ \
|  _  | |\  | | |_| | | | (_) | |_| | |_) |
|_| |_|_| \_|  \____|_|  \___/ \__,_| .__/
                                    |_|""".splitlines()
    if not compact and inner >= 48:
        logo_width = max(map(len, logo))
        for row in logo:
            centre(row.ljust(logo_width), '1;38;5;183')
    elif not (framed and rows < 15):
        centre('HN GROUP', '1;38;5;183')
    centre('POWER MANAGEMENT' if power else 'PM2 PROCESS CONTROLS' if pm2 else 'SERVER WORKSPACE', '38;5;73')
    up, memory, disk = metrics()
    if rows >= 17:
        centre(socket.gethostname() + ' · ' + os.environ.get('USER', str(os.getuid())), '2')
        centre('Uptime ' + up + '   Memory ' + memory + '   Disk ' + disk, '2')
    if not compact:
        line()
    if rows >= 15:
        print(colour('  ' + '─' * (inner - 2) if framed else '├' + '─' * inner + '┤', '38;5;60'))
        line()
    entries = POWER_MENU if power else PM2_MENU if pm2 else MENU
    for key, command, title, hint in entries:
        line('[' + key + ']  ' + title, '1;38;5;211' if command == 'stop-all' else '1;38;5;183')
        if rows >= 21:
            line('     ' + hint, '2')
        if not compact and len(entries) < 4:
            line()
    line('[B]  Back to main menu' if pm2 or power else '[L]  Log out', '38;5;73')
    if not compact:
        line()
    if not framed:
        print(colour('╰' + '─' * inner + '╯', '38;5;141'))
    print(colour('  Choose 1–4 or B, then press Enter.' if power else '  Choose 1–3 or B, then press Enter.' if pm2 else '  Choose 1–5 or L, then press Enter.', '2'))


def pm2_menu():
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        welcome(pm2=True)
        return 0
    if not unlock_pm2():
        return 0
    commands = {key: command for key, command, _, _ in PM2_MENU}
    while True:
        welcome(pm2=True)
        try:
            choice = input('  PM2 choice › ').strip().lower()
            if choice in ('b', '0'):
                return 0
            if choice not in commands:
                print('  Choose 1, 2 or 3, or B to go back.')
                continue
            result = execute(commands[choice], unlocked=True)
            if result:
                print('  Command finished with exit status ' + str(result) + '.')
        except (EOFError, KeyboardInterrupt):
            print()
            return 0


def logs(process=None):
    allowed = catalog()
    if process is None:
        entries = sorted(allowed.items(), key=lambda entry: entry[1].casefold())
        for index, (name, label) in enumerate(entries, 1):
            print('  {:2d}  {} ({})'.format(index, label, name))
        if not sys.stdin.isatty():
            print('Choose a process: horizon logs <name>', file=sys.stderr)
            return 2
        print('   0  Back to the welcome menu')
        while True:
            try:
                choice = input('Website number (0 to go back): ').strip()
            except (EOFError, KeyboardInterrupt):
                return 0
            if choice == '0':
                return 0
            if choice in {str(i) for i in range(1, len(entries) + 1)}:
                process = entries[int(choice) - 1][0]
                break
            print('Choose one of the listed numbers, or 0 to go back.')
    if process not in allowed:
        print('Unknown website process. Use horizon logs to choose from the installed catalog.', file=sys.stderr)
        return 2
    if os.geteuid() != 0:
        print('Website processes run as root. Use sudo horizon logs ' + process, file=sys.stderr)
        return 1
    print('Press Ctrl+C to stop following logs.')
    return run(['pm2', 'logs', process, '--lines', '80'])


def site_menu():
    allowed = catalog()
    domains = {}
    for source in (REPO / 'admin-site/catalog.json', FALLBACK):
        try:
            domains = {row['process']: ' '.join(row.get('hosts', [])) for row in json.loads(source.read_text())}
            break
        except (OSError, ValueError, KeyError, TypeError):
            pass
    while True:
        print(colour('\n  INDIVIDUAL SITES · Search by name, domain or process', '1;38;5;183'))
        query = input('  Search (Enter for all, B to go back) › ').strip()
        if query.lower() == 'b':
            return 0
        rows = sorted(((name, label) for name, label in allowed.items() if query.casefold() in (name + ' ' + label + ' ' + domains.get(name, '')).casefold()), key=lambda row: row[1].casefold())
        if not rows:
            print('  No sites match. Try another search.')
            continue
        for index, (name, label) in enumerate(rows, 1):
            print('  [{}] {} · {}'.format(index, label, name))
        choice = input('  Site number (B to search again) › ').strip()
        if not choice.isdigit() or not 1 <= int(choice) <= len(rows):
            continue
        name, label = rows[int(choice) - 1]
        while True:
            print(colour('\n  ' + label + ' · ' + name, '1;38;5;183'))
            print('  [1] Start   [2] Stop   [3] Restart   [4] Status   [5] Logs   [B] Back')
            action = input('  Site action › ').strip().lower()
            if action == 'b':
                break
            commands = {'1': 'start', '2': 'stop', '3': 'restart', '4': 'describe', '5': 'logs'}
            if action not in commands:
                continue
            operation = commands[action]
            if operation in ('stop', 'restart') and not confirm(operation.capitalize() + ' ' + label + '?'):
                continue
            try:
                run(['pm2', operation, name] + (['--lines', '80'] if operation == 'logs' else []))
            except KeyboardInterrupt:
                print('\n  Returned to site controls.')


def power_menu():
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        welcome(power=True)
        return 0
    if not unlock_pm2():
        return 0
    commands = {key: command for key, command, _, _ in POWER_MENU}
    while True:
        welcome(power=True)
        try:
            choice = input('  Power choice › ').strip().lower()
            if choice in ('b', '0'):
                return 0
            if choice not in commands:
                continue
            execute(commands[choice], unlocked=True)
        except (EOFError, KeyboardInterrupt):
            print()
            return 0


def power_action(action):
    if os.geteuid() != 0:
        print('Server power management requires root.')
        return 1
    descriptions = {
        'restart-server': 'Restart the VPS now? All active connections will disconnect.',
        'soft-shutdown': 'Stop all PM2 processes, the HN VPN and ALL active SSH sessions? Reconnect over public SSH to power up again.',
        'power-up': 'Start the HN VPN and all PM2 processes?',
        'shutdown-server': 'Shut down and power off the VPS? All websites, VPN and SSH sessions will stop. You must use the hosting control panel to start the server again.',
    }
    # Full power-off always rechecks the code, even after entering the protected menu.
    if action == 'shutdown-server' and not unlock_pm2():
        return 1
    if not confirm(descriptions[action]):
        return 0
    unit = 'hn-horizon-power-' + str(time.time_ns())
    result = run(['systemd-run', '--unit=' + unit, '--on-active=3s',
                  '--property=User=root', '--property=WorkingDirectory=' + str(REPO),
                  '/usr/bin/python3', str(Path(__file__).resolve().with_name('power.py')), action])
    if result == 0:
        print('  Scheduled in 3 seconds. Power job: ' + unit)
    return result


def unlock_account():
    if os.geteuid() != 0:
        print('Use sudo horizon unlock-account to recover an HN account.', file=sys.stderr)
        return 1
    if not unlock_pm2():
        return 1
    try:
        email = input('  Sign-in email (B to go back) › ').strip().lower()
        if email == 'b':
            return 0
        if len(email) > 254 or '@' not in email or any(c.isspace() for c in email):
            print('  Enter the full sign-in email address.')
            return 1
        secret = Path('/var/lib/hn-status-sso/secret').read_text().strip()
        request = urllib.request.Request(
            'http://127.0.0.1:3250/api/auth/account-unlock',
            data=json.dumps({'email': email}).encode(), method='POST',
            headers={'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/json'})
        # Recovery stays on loopback, including on hosts with HTTP proxy variables.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(request, timeout=10) as response:
            result = json.load(response)
        print('  ' + result['username'] + ' unlocked.' + ('' if result['enabled'] else ' Sign-in remains disabled.'))
        return 0
    except urllib.error.HTTPError as error:
        try:
            message = json.load(error).get('error', 'Account recovery failed.')
        except (ValueError, OSError):
            message = 'Account recovery failed.'
        print('  ' + message)
        return 1
    except (OSError, ValueError, KeyError):
        print('  Account recovery is unavailable. Check that hn-accounts is running.')
        return 1
    except (EOFError, KeyboardInterrupt):
        print('\n  Account recovery cancelled.')
        return 0


def execute(command, process=None, unlocked=False):
    if command == 'unlock-account':
        return unlock_account()
    if command in ('start-all', 'stop-all', 'sites', 'restart-server', 'soft-shutdown', 'power-up') and not unlocked and not unlock_pm2():
        return 1
    if command == 'power':
        return power_menu()
    if command in ('restart-server', 'soft-shutdown', 'power-up', 'shutdown-server'):
        return power_action(command)
    if command == 'sites':
        return site_menu()
    if command == 'pm2':
        return pm2_menu()
    if command == 'start-all':
        if os.geteuid() != 0:
            print('Use sudo horizon start-all to manage the server processes.', file=sys.stderr)
            return 1
        return run(['pm2', 'start', 'all'])
    if command == 'terminal':
        return 0
    if command == 'codex':
        return run(['codex'], cwd=REPO)
    if command == 'stop-all':
        if os.geteuid() != 0:
            print('Use sudo horizon stop-all to manage the server processes.', file=sys.stderr)
            return 1
        if not confirm('Stop ALL PM2 processes? All hosted services will go offline.'):
            return 0
        return run(['pm2', 'stop', 'all'])
    if command == 'logs':
        return logs(process)
    if command in ('status', 'update', 'nginx-check', 'nginx-reload', 'vpn') and os.geteuid() != 0:
        print('Use sudo horizon ' + command + ' for this server shortcut.', file=sys.stderr)
        return 1
    if command == 'status':
        return run(['pm2', 'ls'])
    if command == 'update':
        if not confirm('Pull the latest code and run the selective website installer?'):
            return 0
        result = run(['git', 'pull'], cwd=REPO)
        return result if result else run(['sudo', 'bash', 'install.sh'], cwd=REPO)
    if command == 'nginx-check':
        return run(['nginx', '-t'])
    if command == 'nginx-reload':
        if not confirm('Check the configuration and reload nginx?'):
            return 0
        result = run(['nginx', '-t'])
        return result if result else run(['systemctl', 'reload', 'nginx'])
    if command == 'vpn':
        return run(['wg', 'show', 'wg-hn'])
    if command == 'resources':
        results = [run(['uptime']), run(['free', '-h']), run(['df', '-h', '/'])]
        return max(results)
    if command == 'git':
        result = run(['git', 'status', '--short', '--branch'], cwd=REPO)
        return result if result else run(['git', 'log', '-1', '--oneline'], cwd=REPO)
    return 2


def main(argv=None):
    parser = argparse.ArgumentParser(description='HN Group VPS welcome and operational shortcuts.')
    parser.add_argument('command', nargs='?', choices=['help'] + [row[1] for row in ACTIONS + MENU + PM2_MENU + POWER_MENU])
    parser.add_argument('process', nargs='?', help='An exact website process name for logs.')
    parser.add_argument('--welcome', action='store_true', help='Show the login welcome without reading input.')
    parser.add_argument('--session', action='store_true', help='Start the idle-aware SSH terminal session.')
    parser.add_argument('--shell', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    if args.session or args.shell:
        from session import session
        return session(main, LOGOUT, show_menu=not args.shell)
    if args.process and args.command != 'logs':
        parser.error('A process name is accepted only by the logs shortcut.')
    if args.command == 'help':
        welcome()
        for _, command, description, exact in MENU + PM2_MENU + POWER_MENU + ACTIONS:
            print(description + '\n  horizon ' + command + '\n  ' + exact + '\n')
        return 0
    if args.command:
        return execute(args.command, args.process)
    welcome()
    if args.welcome or not sys.stdin.isatty() or not sys.stdout.isatty():
        return 0
    commands = {number: command for number, command, _, _ in MENU}
    while True:
        try:
            choice = input('  Your choice › ').strip().lower()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if choice in ('0', '1'):
            return 0
        if choice == 'l':
            print(colour('  Signed out. See you soon.', '38;5;73'))
            return LOGOUT
        if choice not in commands:
            print('  Choose 1, 2, 3, 4 or 5, or L to log out.')
            continue
        try:
            result = execute(commands[choice])
            if result:
                print('  Shortcut finished with exit status ' + str(result) + '.')
        except KeyboardInterrupt:
            print('\n  Shortcut stopped. Returning to the welcome menu.')
        welcome()


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print()
        sys.exit(130)
