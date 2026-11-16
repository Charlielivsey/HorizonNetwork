import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import pty
import select
import subprocess
import sys
import tempfile
import time
import types
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
import horizon
import power

class Controls(unittest.TestCase):
    def test_pin_required_and_hash_verification(self):
        with tempfile.TemporaryDirectory() as directory:
            pin=Path(directory)/'pin.json';salt=os.urandom(16)
            pin.write_text(json.dumps({'salt':salt.hex(),'hash':hashlib.pbkdf2_hmac('sha256',b'test-pin',salt,200000).hex()}))
            with patch.object(horizon,'PIN_FILE',pin),patch.object(horizon.sys,'stdin') as stdin,patch.object(horizon.getpass,'getpass',side_effect=['wrong','test-pin']),contextlib.redirect_stdout(io.StringIO()):
                stdin.isatty.return_value=True
                self.assertTrue(horizon.unlock_pm2())
            with patch.object(horizon,'unlock_pm2',return_value=False),patch.object(horizon,'run') as run:
                for action in ('start-all','stop-all','sites','restart-server','soft-shutdown','power-up'):
                    self.assertEqual(horizon.execute(action),1)
                run.assert_not_called()
            with patch.object(horizon,'unlock_pm2',return_value=False),patch.object(horizon,'welcome') as welcome,patch.object(horizon.sys,'stdin') as stdin,patch.object(horizon.sys,'stdout') as stdout:
                stdin.isatty.return_value=stdout.isatty.return_value=True
                self.assertEqual(horizon.pm2_menu(),0);self.assertEqual(horizon.power_menu(),0)
                welcome.assert_not_called()

    def test_nested_site_search_and_actions_are_allowlisted(self):
        with patch.object(horizon,'catalog',return_value={'hn-auth':'HN Group Auth','hn-docs':'HN Group Docs'}),patch('builtins.input',side_effect=['unknown','auth','1','1','2','3','4','5','b','b']),patch.object(horizon,'confirm',return_value=True),patch.object(horizon,'run',return_value=0) as run,contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(horizon.site_menu(),0)
            self.assertEqual([c.args[0] for c in run.call_args_list],[['pm2','start','hn-auth'],['pm2','stop','hn-auth'],['pm2','restart','hn-auth'],['pm2','describe','hn-auth'],['pm2','logs','hn-auth','--lines','80']])

    def test_power_jobs_require_confirmation_and_detach(self):
        with patch.object(horizon,'confirm',return_value=False),patch.object(horizon.os,'geteuid',return_value=0),patch.object(horizon,'run') as run:
            horizon.power_action('soft-shutdown');run.assert_not_called()
        with patch.object(horizon,'confirm',return_value=True),patch.object(horizon.os,'geteuid',return_value=0),patch.object(horizon,'run',return_value=0) as run,contextlib.redirect_stdout(io.StringIO()):
            for action in ('restart-server','soft-shutdown','power-up'):
                horizon.power_action(action)
                args=run.call_args.args[0]
                self.assertEqual(args[0],'systemd-run');self.assertIn('--on-active=3s',args);self.assertEqual(args[-1],action)

    def test_full_shutdown_rechecks_pin_even_inside_unlocked_menu(self):
        with patch.object(horizon.os, 'geteuid', return_value=0), patch.object(horizon, 'unlock_pm2', return_value=False) as pin, patch.object(horizon, 'confirm') as confirm, patch.object(horizon, 'run') as run:
            self.assertEqual(horizon.execute('shutdown-server', unlocked=True), 1)
            pin.assert_called_once(); confirm.assert_not_called(); run.assert_not_called()
        for accepted in (False, True):
            with patch.object(horizon.os, 'geteuid', return_value=0), patch.object(horizon, 'unlock_pm2', return_value=True) as pin, patch.object(horizon, 'confirm', return_value=accepted), patch.object(horizon, 'run', return_value=0) as run, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(horizon.execute('shutdown-server', unlocked=True), 0)
                pin.assert_called_once()
                if accepted:
                    args = run.call_args.args[0]
                    self.assertEqual(args[0], 'systemd-run'); self.assertEqual(args[-1], 'shutdown-server')
                else:
                    run.assert_not_called()

    def test_power_menu_entry_and_full_shutdown_each_require_code(self):
        with patch.object(horizon.os, 'geteuid', return_value=0), patch.object(horizon, 'unlock_pm2', side_effect=[True, True]) as pin, patch.object(horizon, 'welcome'), patch.object(horizon.sys, 'stdin') as stdin, patch.object(horizon.sys, 'stdout') as stdout, patch('builtins.input', side_effect=['4', 'b']), patch.object(horizon, 'confirm', return_value=True), patch.object(horizon, 'run', return_value=0) as run:
            stdin.isatty.return_value = stdout.isatty.return_value = True
            self.assertEqual(horizon.power_menu(), 0)
            self.assertEqual(pin.call_count, 2)
            self.assertEqual(run.call_args.args[0][-1], 'shutdown-server')

    def test_full_shutdown_worker_uses_graceful_system_poweroff(self):
        with patch.object(power.os, 'geteuid', return_value=0), patch.object(power, 'command', return_value=types.SimpleNamespace(returncode=0)) as command:
            self.assertEqual(power.perform('shutdown-server'), 0)
            command.assert_called_once_with(['systemctl', 'poweroff'])

    def test_soft_shutdown_stops_services_before_ssh_and_power_up_restores(self):
        calls=[]
        def command(args):
            calls.append(args);return types.SimpleNamespace(returncode=0,stdout='')
        with patch.object(power.os,'geteuid',return_value=0),patch.object(power,'ssh_sessions',return_value=['7','8']),patch.object(power,'vpn',side_effect=lambda start:calls.append(['vpn',start]) or 0),patch.object(power,'command',side_effect=command):
            self.assertEqual(power.perform('soft-shutdown'),0)
            self.assertEqual(calls,[['pm2','stop','all'],['vpn',False],['loginctl','terminate-session','7'],['loginctl','terminate-session','8']])
            calls.clear();self.assertEqual(power.perform('power-up'),0)
            self.assertEqual(calls,[['vpn',True],['pm2','start','all']])

    def test_ssh_enumeration_excludes_local_sessions(self):
        def command(args):
            if args[1]=='list-sessions':return types.SimpleNamespace(returncode=0,stdout='1 root\n2 root\n3 root\n')
            return types.SimpleNamespace(returncode=0,stdout={'1':'Service=sshd\nRemote=yes','2':'Service=systemd-user\nRemote=no','3':'Service=login\nRemote=no'}[args[2]])
        with patch.object(power,'command',side_effect=command):self.assertEqual(power.ssh_sessions(),['1'])

class IdleSession(unittest.TestCase):
    def test_idle_menu_excludes_codex_and_any_other_foreground_application(self):
        import session as terminal_session
        with patch.object(terminal_session.os,'tcgetpgrp',return_value=200):
            self.assertFalse(terminal_session.shell_is_idle(True,10,100))
        with patch.object(terminal_session.os,'tcgetpgrp',return_value=100):
            self.assertFalse(terminal_session.shell_is_idle(False,10,100))
            self.assertTrue(terminal_session.shell_is_idle(True,10,100))

    def test_login_opens_frame_before_showing_menu(self):
        import session as terminal_session
        from unittest.mock import Mock
        menu=Mock(return_value=10)
        with patch.object(terminal_session.sys,'stdin') as stdin,patch.object(terminal_session.sys,'stdout') as stdout,patch.dict(os.environ,{'HN_HORIZON_FRAME_ACTIVE':'0'}),patch('frame.launch',return_value=0) as launch:
            stdin.isatty.return_value=stdout.isatty.return_value=True
            self.assertEqual(terminal_session.session(menu,10),0)
            launch.assert_called_once_with(show_menu=True)
            menu.assert_not_called()
        with patch.object(terminal_session.sys,'stdin') as stdin,patch.object(terminal_session.sys,'stdout') as stdout,patch.dict(os.environ,{'HN_HORIZON_FRAME_ACTIVE':'1'}):
            stdin.isatty.return_value=stdout.isatty.return_value=True
            self.assertEqual(terminal_session.session(menu,10),0)
            menu.assert_called_once_with([])

    def test_idle_reopens_menu_preserves_buffer_and_does_not_interrupt_jobs(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory);rc=folder/'rc';done=folder/'done'
            rc.write_text((ROOT/'session.bash').read_text() + "\nPS1='SHELL_READY> '\n")
            code="import sys;sys.path.insert(0,"+repr(str(ROOT))+");from session import session\ndef menu(_):\n print('MENU_READY',flush=True)\n return 10 if input().lower()=='l' else 0\nsys.exit(session(menu,10,timeout=.7,rcfile="+repr(str(rc))+"))\n"
            master,slave=pty.openpty()
            child=subprocess.Popen([sys.executable,'-c',code],stdin=slave,stdout=slave,stderr=slave,start_new_session=True)
            os.close(slave);output=b''
            def until(marker,seconds=5):
                nonlocal output
                end=time.monotonic()+seconds
                while marker not in output and time.monotonic()<end:
                    if select.select([master],[],[],.05)[0]:
                        try:output+=os.read(master,65536)
                        except OSError:break
                self.assertIn(marker,output[-500:])
            try:
                until(b'MENU_READY');output=b'';os.write(master,b'1\n');until(b'SHELL_READY>')
                output=b'';os.write(master,b'sleep 2\n')
                # Longer than idle limit, shorter than command: no menu over the running job.
                end=time.monotonic()+1.1
                while time.monotonic()<end:
                    if select.select([master],[],[],.05)[0]:output+=os.read(master,65536)
                self.assertNotIn(b'MENU_READY',output)
                until(b'SHELL_READY>');output=b''
                os.write(master,('printf done > '+str(done)).encode())
                until(b'MENU_READY');self.assertFalse(done.exists())
                output=b'';os.write(master,b'1\n');time.sleep(.1);os.write(master,b'\n')
                until(b'SHELL_READY>');
                end=time.monotonic()+2
                while not done.exists() and time.monotonic()<end:time.sleep(.02)
                self.assertEqual(done.read_text(),'done')
                output=b'';until(b'MENU_READY');os.write(master,b'l\n');self.assertEqual(child.wait(timeout=3),0)
            finally:
                if child.poll() is None:child.kill();child.wait()
                os.close(master)

if __name__=='__main__':unittest.main()
