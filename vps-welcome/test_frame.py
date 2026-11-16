import pathlib
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

ROOT=pathlib.Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
import frame

@unittest.skipUnless(shutil.which('tmux'),'tmux is required for terminal framing')
class FrameTests(unittest.TestCase):
    def test_frame_shell_fullscreen_resize_and_exit(self):
        with tempfile.TemporaryDirectory() as folder:
            config=pathlib.Path(folder)/'tmux.conf';config.write_text(frame.CONFIG)
            tmux=['tmux','-S',str(pathlib.Path(folder)/'socket'),'-f',str(config)]
            def call(*args):return subprocess.check_output(tmux+list(args),text=True,stderr=subprocess.DEVNULL)
            try:
                centre=frame.create_frame(tmux,['bash','--noprofile','--norc','-i'],120,35)
                panes=call('list-panes','-F','#{pane_id} #{pane_width} #{pane_height} #{pane_active}').splitlines()
                self.assertEqual(len(panes),5)
                main=next(row.split() for row in panes if row.startswith(centre+' '))
                self.assertEqual(main[1:],[str(116),str(29),'1'])
                # Output cannot scroll over the header or footer panes.
                call('send-keys','-t',centre,"printf 'FRAME_SHELL_OK\\n'; seq 1 150",'Enter')
                time.sleep(.2)
                end=time.monotonic()+3
                while True:
                    captures=[call('capture-pane','-p','-t',row.split()[0]) for row in panes]
                    if (any('HN Group' in text for text in captures) and any('F9 · leave Codex' in text for text in captures)) or time.monotonic()>end:break
                    time.sleep(.05)
                self.assertTrue(any('HN Group' in text for text in captures))
                self.assertTrue(any('F9 · leave Codex' in text for text in captures))
                self.assertTrue(any('SECURE ACCESS TERMINAL' in text for text in captures))
                # An alternate-screen application clears only the shell viewport.
                call('send-keys','-t',centre,"printf '\\033[?1049h\\033[2JFULLSCREEN_OK'; sleep .1; printf '\\033[?1049l'",'Enter')
                time.sleep(.25)
                self.assertTrue(any('HN Group' in call('capture-pane','-p','-t',row.split()[0]) for row in panes))
                call('resize-window','-t','hn','-x','90','-y','28')
                dimensions=call('display-message','-p','-t',centre,'#{pane_width} #{pane_height}').strip()
                self.assertEqual(dimensions,'86 22')
                call('send-keys','-t',centre,'exit','Enter')
                end=time.monotonic()+3
                while time.monotonic()<end:
                    result=subprocess.run(tmux+['has-session','-t','hn'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                    if result.returncode:break
                    time.sleep(.05)
                self.assertNotEqual(result.returncode,0,'logging out closes the entire frame')
            finally:
                subprocess.run(tmux+['kill-server'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

    def test_horizon_menu_fits_actual_ssh_viewport_after_motd(self):
        # Match the user's 120x30 SSH terminal; its framed shell has only 24 rows.
        with tempfile.TemporaryDirectory() as folder:
            config=pathlib.Path(folder)/'tmux.conf';config.write_text(frame.CONFIG)
            tmux=['tmux','-S',str(pathlib.Path(folder)/'socket'),'-f',str(config)]
            try:
                centre=frame.create_frame(tmux,['env','HN_HORIZON_FRAME_ACTIVE=1','COLUMNS=120','LINES=38',sys.executable,str(ROOT/'horizon.py')],120,30)
                end=time.monotonic()+4
                while True:
                    text=subprocess.check_output(tmux+['capture-pane','-p','-t',centre],text=True)
                    if 'Your choice' in text or time.monotonic()>end:break
                    time.sleep(.05)
                for expected in ('HN GROUP','SERVER WORKSPACE','[1]  Open terminal','[4]  Power management','[L]  Log out','Your choice'):
                    self.assertIn(expected,text)
                self.assertNotIn('╭',text,'use the existing outer frame instead of nesting another box')
                self.assertEqual(subprocess.check_output(tmux+['display-message','-p','-t',centre,'#{pane_height}'],text=True).strip(),'24')
            finally:
                subprocess.run(tmux+['kill-server'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

    def test_leave_codex_returns_to_menu_without_closing_frame(self):
        import os, shlex
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder)
            fake=root/'codex';fake.write_text('#!/bin/sh\necho CODEX_READY\nexec sleep 3600\n');fake.chmod(0o755)
            config=root/'tmux.conf';config.write_text(frame.CONFIG)
            tmux=['tmux','-S',str(root/'socket'),'-f',str(config)]
            def call(*args):return subprocess.check_output(tmux+list(args),text=True)
            try:
                centre=frame.create_frame(tmux,['env','HN_HORIZON_FRAME_ACTIVE=1','PATH='+folder+':'+os.environ['PATH'],sys.executable,str(ROOT/'horizon.py')],120,30)
                def wait_for(marker):
                    end=time.monotonic()+5
                    while time.monotonic()<end:
                        text=call('capture-pane','-p','-t',centre)
                        if marker in text:return text
                        time.sleep(.05)
                    self.fail('Missing '+marker)
                wait_for('Your choice');call('send-keys','-t',centre,'2','Enter');wait_for('CODEX_READY')
                runner=call('show-options','-pqv','-t',centre,'@hn-codex-runner').strip()
                self.assertTrue(runner.isdigit())
                # Run the exact callback bound to F9, inside this isolated tmux environment.
                self.assertIn('--leave-codex',call('list-keys','-T','root','F9'))
                call('run-shell','-t',centre,shlex.join([sys.executable,str(ROOT/'frame.py'),'--leave-codex',centre]))
                wait_for('Your choice')
                self.assertEqual(call('show-options','-pqv','-t',centre,'@hn-codex-runner').strip(),'')
                call('has-session','-t','hn')
                self.assertNotIn('CODEX_READY',call('capture-pane','-p','-t',centre))
            finally:
                subprocess.run(tmux+['kill-server'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

if __name__=='__main__':unittest.main()
