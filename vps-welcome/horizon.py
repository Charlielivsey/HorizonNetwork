#!/usr/bin/env python3
"""HN Group VPS welcome and fixed, reviewable operational shortcuts. Standard library only."""
import argparse
import json
import os
from pathlib import Path
import shlex
import shutil
import socket
import subprocess
import sys

REPO = Path('/root/HorizonNetwork')
FALLBACK = Path(__file__).resolve().with_name('catalog.json')
RESET = '\033[0m'


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
                return result
        except (OSError, ValueError, TypeError, KeyError):
            pass
    return {'hn-accounts': 'Private staff-account backend'}


def run(argv, cwd=None):
    print(colour('$ ' + shlex.join(argv), '2'), flush=True)
    if not shutil.which(argv[0]):
        print('The command is not installed: ' + argv[0], file=sys.stderr)
        return 1
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


def welcome():
    width = min(shutil.get_terminal_size((88, 24)).columns, 100)
    width = max(32, width)
    print()
    print(colour('━' * width, '38;5;141'))
    print(colour('  HN GROUP', '1;38;5;183') + '  /  VPS WORKSPACE')
    print('  ' + socket.gethostname() + '  ·  ' + os.environ.get('USER', str(os.getuid())) + '  ·  ' + str(REPO))
    up, memory, disk = metrics()
    print(colour('  Uptime ' + up + '   Memory ' + memory + '   Disk ' + disk, '2'))
    print(colour('━' * width, '38;5;73'))
    for number, command, description, _ in ACTIONS:
        print('  ' + colour(number, '1;38;5;183') + '  ' + description)
        print(colour('     horizon ' + command, '2'))
    print()
    print('  ' + colour('0', '1;38;5;183') + '  Open the normal console')
    print('  Choose a number, then press Enter. Type horizon in the console to reopen.')
    print('  horizon help: show the exact commands')
    print()


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


def execute(command, process=None):
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
    parser.add_argument('command', nargs='?', choices=['help'] + [row[1] for row in ACTIONS])
    parser.add_argument('process', nargs='?', help='An exact website process name for logs.')
    parser.add_argument('--welcome', action='store_true', help='Show the login welcome without reading input.')
    args = parser.parse_args(argv)
    if args.process and args.command != 'logs':
        parser.error('A process name is accepted only by the logs shortcut.')
    if args.command == 'help':
        welcome()
        for _, command, description, exact in ACTIONS:
            print(description + '\n  horizon ' + command + '\n  ' + exact + '\n')
        return 0
    if args.command:
        return execute(args.command, args.process)
    welcome()
    if args.welcome or not sys.stdin.isatty() or not sys.stdout.isatty():
        return 0
    commands = {number: command for number, command, _, _ in ACTIONS}
    while True:
        try:
            choice = input('  Choose a number (0 for console): ').strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if choice == '0':
            return 0
        if choice not in commands:
            print('  Choose a number from 0 to 8. Use 0 to open the console.')
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
