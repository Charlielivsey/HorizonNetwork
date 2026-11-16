"""Explicitly selected server power jobs, detached from the SSH connection they close."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys


def command(argv):
    result = subprocess.run(argv, check=False, capture_output=True, text=True)
    if result.returncode:
        print('Power command failed: ' + ' '.join(argv) + ' (exit ' + str(result.returncode) + ')', file=sys.stderr, flush=True)
    return result


def vpn(start):
    if start:
        if 'wg-hn' in command(['wg', 'show', 'interfaces']).stdout.split():
            return 0
        return command(['systemctl', 'start', 'wg-quick@wg-hn']).returncode
    # Stop the systemd-managed tunnel, or an interface previously started by wg-quick directly.
    managed = command(['systemctl', 'is-active', '--quiet', 'wg-quick@wg-hn']).returncode == 0
    if managed:
        return command(['systemctl', 'stop', 'wg-quick@wg-hn']).returncode
    interfaces = command(['wg', 'show', 'interfaces'])
    if 'wg-hn' in interfaces.stdout.split():
        return command(['wg-quick', 'down', 'wg-hn']).returncode
    return 0


def ssh_sessions():
    result = command(['loginctl', 'list-sessions', '--no-legend', '--no-pager'])
    if result.returncode:
        raise RuntimeError('Unable to enumerate active SSH sessions.')
    sessions = []
    for line in result.stdout.splitlines():
        session = line.split()[0] if line.split() else ''
        if not re.fullmatch(r'[A-Za-z0-9_-]+', session):
            continue
        details = command(['loginctl', 'show-session', session, '-p', 'Service', '-p', 'Remote'])
        if details.returncode:
            continue
        fields = dict(row.split('=', 1) for row in details.stdout.splitlines() if '=' in row)
        if fields.get('Service') in ('sshd', 'ssh') and fields.get('Remote') == 'yes':
            sessions.append(session)
    return sessions


def perform(action):
    if os.geteuid() != 0:
        raise RuntimeError('Server power management requires root.')
    if action == 'shutdown-server':
        return command(['systemctl', 'poweroff']).returncode
    if action == 'restart-server':
        return command(['systemctl', 'reboot']).returncode
    if action == 'power-up':
        results = [vpn(True), command(['pm2', 'start', 'all']).returncode]
        return max(results)
    if action == 'soft-shutdown':
        # Enumerate before disconnecting anything; the systemd job is outside these SSH sessions.
        sessions = ssh_sessions()
        results = [command(['pm2', 'stop', 'all']).returncode, vpn(False)]
        for session in sessions:
            results.append(command(['loginctl', 'terminate-session', session]).returncode)
        return max(results, default=0)
    raise ValueError('Unknown power operation.')


if __name__ == '__main__':
    try:
        raise SystemExit(perform(sys.argv[1]))
    except (IndexError, RuntimeError, ValueError, OSError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
