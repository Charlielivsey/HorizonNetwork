import contextlib
import importlib.util
import io
import os
from pathlib import Path
import pty
import select
import shlex
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('horizon', ROOT / 'horizon.py')
horizon = importlib.util.module_from_spec(spec)
spec.loader.exec_module(horizon)


class ShortcutTests(unittest.TestCase):
    def test_unknown_process_never_executes(self):
        with patch.object(horizon, 'catalog', return_value={'hn-auth': 'Auth'}), patch.object(horizon, 'run') as run:
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(horizon.logs('hn-auth; reboot'), 2)
            run.assert_not_called()

    def test_logs_use_one_exact_catalog_process(self):
        with patch.object(horizon, 'catalog', return_value={'hn-auth': 'Auth'}), patch.object(horizon.os, 'geteuid', return_value=0), patch.object(horizon, 'run', return_value=0) as run:
            with contextlib.redirect_stdout(io.StringIO()):
                horizon.logs('hn-auth')
            run.assert_called_once_with(['pm2', 'logs', 'hn-auth', '--lines', '80'])

    def test_failed_pull_cannot_run_installer(self):
        with patch.object(horizon.os, 'geteuid', return_value=0), patch.object(horizon, 'confirm', return_value=True), patch.object(horizon, 'run', return_value=1) as run:
            self.assertEqual(horizon.execute('update'), 1)
            run.assert_called_once_with(['git', 'pull'], cwd=horizon.REPO)

    def test_failed_nginx_check_cannot_reload(self):
        with patch.object(horizon.os, 'geteuid', return_value=0), patch.object(horizon, 'confirm', return_value=True), patch.object(horizon, 'run', return_value=1) as run:
            self.assertEqual(horizon.execute('nginx-reload'), 1)
            run.assert_called_once_with(['nginx', '-t'])

    def test_declining_update_never_runs_commands(self):
        with patch.object(horizon.os, 'geteuid', return_value=0), patch.object(horizon, 'confirm', return_value=False), patch.object(horizon, 'run') as run:
            self.assertEqual(horizon.execute('update'), 0)
            run.assert_not_called()

    def test_welcome_cannot_read_or_run_commands(self):
        with patch('builtins.input', side_effect=AssertionError('Login may not read input')), patch.object(horizon, 'run') as run, contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(horizon.main(['--welcome']), 0)
            self.assertIn('Open terminal', output.getvalue())
            run.assert_not_called()

    def test_menu_requires_numbers_and_stays_open_after_shortcuts(self):
        with patch.object(horizon.sys, 'stdin') as stdin, patch.object(horizon.sys, 'stdout') as stdout, patch.object(horizon, 'welcome') as welcome, patch.object(horizon, 'execute', return_value=0) as execute, patch('builtins.input', side_effect=['', 'status', '9', '2', '3', '1']):
            stdin.isatty.return_value = stdout.isatty.return_value = True
            self.assertEqual(horizon.main([]), 0)
            self.assertEqual([call.args for call in execute.call_args_list], [('codex',), ('pm2',)])
            self.assertEqual(welcome.call_count, 3)

    def test_interrupted_shortcut_returns_to_menu(self):
        with patch.object(horizon.sys, 'stdin') as stdin, patch.object(horizon.sys, 'stdout') as stdout, patch.object(horizon, 'welcome') as welcome, patch.object(horizon, 'execute', side_effect=KeyboardInterrupt), patch('builtins.input', side_effect=['3', '0']):
            stdin.isatty.return_value = stdout.isatty.return_value = True
            self.assertEqual(horizon.main([]), 0)
            self.assertEqual(welcome.call_count, 2)

    def test_log_menu_rejects_names_and_accepts_number(self):
        with patch.object(horizon, 'catalog', return_value={'hn-auth': 'Auth'}), patch.object(horizon.sys, 'stdin') as stdin, patch.object(horizon.os, 'geteuid', return_value=0), patch.object(horizon, 'run', return_value=0) as run, patch('builtins.input', side_effect=['', 'hn-auth', '1']), contextlib.redirect_stdout(io.StringIO()):
            stdin.isatty.return_value = True
            self.assertEqual(horizon.logs(), 0)
            run.assert_called_once_with(['pm2', 'logs', 'hn-auth', '--lines', '80'])

    def test_codex_opens_in_project(self):
        with patch.object(horizon, 'run', return_value=0) as run:
            self.assertEqual(horizon.execute('codex'), 0)
            run.assert_called_once_with(['codex'], cwd=horizon.REPO)

    def test_stop_all_requires_confirmation_and_uses_fixed_command(self):
        with patch.object(horizon.os, 'geteuid', return_value=0), patch.object(horizon, 'confirm', return_value=False) as confirm, patch.object(horizon, 'run', return_value=0) as run:
            self.assertEqual(horizon.execute('stop-all', unlocked=True), 0)
            run.assert_not_called()
            confirm.return_value = True
            self.assertEqual(horizon.execute('stop-all', unlocked=True), 0)
            run.assert_called_once_with(['pm2', 'stop', 'all'])

    def test_start_all_uses_fixed_command(self):
        with patch.object(horizon.os, 'geteuid', return_value=0), patch.object(horizon, 'run', return_value=0) as run:
            self.assertEqual(horizon.execute('start-all', unlocked=True), 0)
            run.assert_called_once_with(['pm2', 'start', 'all'])

    def test_pm2_submenu_routes_actions_and_back(self):
        with patch.object(horizon.sys, 'stdin') as stdin, patch.object(horizon.sys, 'stdout') as stdout, patch.object(horizon, 'welcome') as welcome, patch.object(horizon, 'unlock_pm2', return_value=True), patch.object(horizon, 'execute', return_value=0) as execute, patch('builtins.input', side_effect=['invalid', '1', '2', 'B']):
            stdin.isatty.return_value = stdout.isatty.return_value = True
            self.assertEqual(horizon.pm2_menu(), 0)
            self.assertEqual([call.args for call in execute.call_args_list], [('start-all',), ('stop-all',)])
            self.assertEqual(welcome.call_count, 4)

    def test_logout_returns_shell_handoff_code(self):
        with patch.object(horizon.sys, 'stdin') as stdin, patch.object(horizon.sys, 'stdout') as stdout, patch.object(horizon, 'welcome'), patch('builtins.input', return_value='L'), patch.object(horizon, 'execute') as execute:
            stdin.isatty.return_value = stdout.isatty.return_value = True
            self.assertEqual(horizon.main([]), horizon.LOGOUT)
            execute.assert_not_called()

    def test_numeric_confirmation(self):
        with patch.object(horizon.sys, 'stdin') as stdin:
            stdin.isatty.return_value = True
            for answer, expected in [('1', True), ('0', False), ('', False), ('yes', False)]:
                with patch('builtins.input', return_value=answer):
                    self.assertEqual(horizon.confirm('Continue?'), expected)


class LoginTests(unittest.TestCase):
    def hook(self, interactive, tty, ssh=True, disabled=False):
        with tempfile.TemporaryDirectory() as name:
            directory = Path(name)
            marker = directory / 'called'
            command = directory / 'horizon'
            command.write_text('#!/bin/sh\necho welcome >> ' + str(marker) + '\n')
            command.chmod(0o755)
            hook = directory / 'hook.sh'
            hook.write_text((ROOT / 'profile.sh').read_text().replace('/usr/local/bin/horizon', str(command)))
            env = {**os.environ, 'TERM': 'xterm-256color'}
            for key in ('HN_HORIZON_SHOWN', 'SSH_CONNECTION', 'HN_HORIZON_DISABLE'):
                env.pop(key, None)
            if ssh:
                env['SSH_CONNECTION'] = '192.0.2.2 12345 192.0.2.1 22'
            if disabled:
                env['HN_HORIZON_DISABLE'] = '1'
            argv = ['/bin/bash', '--noprofile', '--norc', '-ic' if interactive else '-c', '. "' + str(hook) + '"; . "' + str(hook) + '"']
            if tty:
                master, slave = pty.openpty()
                try:
                    result = subprocess.run(argv, stdin=slave, stdout=slave, stderr=slave, env=env, timeout=5)
                finally:
                    os.close(slave)
                    os.close(master)
            else:
                result = subprocess.run(argv, input=b'', stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, timeout=5)
            self.assertEqual(result.returncode, 0)
            return marker.read_text().splitlines() if marker.exists() else []

    def test_interactive_ssh_opens_menu_once(self):
        self.assertEqual(self.hook(True, True), ['welcome'])

    def test_command_ssh_with_or_without_tty_stays_silent(self):
        self.assertEqual(self.hook(False, True), [])
        self.assertEqual(self.hook(False, False), [])

    def test_interactive_without_terminal_or_without_ssh_is_untouched(self):
        self.assertEqual(self.hook(True, False), [])
        self.assertEqual(self.hook(True, True, ssh=False), [])

    def test_opt_out_disables_automatic_welcome(self):
        self.assertEqual(self.hook(True, True, disabled=True), [])

    def test_isolated_installer_writes_only_expected_files(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            subprocess.run(['bash', str(ROOT / 'install.sh')], env={**os.environ, 'HN_HORIZON_INSTALL_ROOT': name}, check=True, stdout=subprocess.PIPE)
            files = {str(p.relative_to(root)) for p in root.rglob('*') if p.is_file()}
            self.assertEqual(files, {'usr/local/bin/horizon', 'usr/local/lib/hn-horizon/horizon.py', 'usr/local/lib/hn-horizon/session.py', 'usr/local/lib/hn-horizon/session.bash', 'usr/local/lib/hn-horizon/power.py', 'usr/local/lib/hn-horizon/frame.py', 'usr/local/lib/hn-horizon/catalog.json', 'etc/profile.d/90-hn-horizon.sh'})


if __name__ == '__main__':
    unittest.main()
