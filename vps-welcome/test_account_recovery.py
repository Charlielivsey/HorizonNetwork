import contextlib
import io
import json
import unittest
from unittest.mock import patch, MagicMock
import horizon

class AccountRecovery(unittest.TestCase):
    def test_root_and_admin_pin_required_before_recovery(self):
        with patch.object(horizon.os, 'geteuid', return_value=1000), patch.object(horizon, 'unlock_pm2') as pin, patch.object(horizon.urllib.request, 'build_opener') as opener, contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(horizon.unlock_account(), 1)
            pin.assert_not_called()
            opener.assert_not_called()
        with patch.object(horizon.os, 'geteuid', return_value=0), patch.object(horizon, 'unlock_pm2', return_value=False), patch.object(horizon.urllib.request, 'build_opener') as opener:
            self.assertEqual(horizon.unlock_account(), 1)
            opener.assert_not_called()

    def test_email_prompt_and_single_writer_loopback_request(self):
        response = MagicMock()
        response.__enter__.return_value = io.StringIO(json.dumps({'username':'test@hngroup.org.uk','enabled':True}))
        opener = MagicMock()
        opener.open.return_value = response
        with patch.object(horizon.os, 'geteuid', return_value=0), patch.object(horizon, 'unlock_pm2', return_value=True), patch('builtins.input', return_value=' TEST@HNGROUP.ORG.UK '), patch.object(horizon.Path,'read_text',return_value='a'*64), patch.object(horizon.urllib.request,'build_opener',return_value=opener), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(horizon.execute('unlock-account'),0)
            request = opener.open.call_args.args[0]
            self.assertEqual(request.full_url,'http://127.0.0.1:3250/api/auth/account-unlock')
            self.assertEqual(json.loads(request.data),{'email':'test@hngroup.org.uk'})
            self.assertEqual(request.get_method(),'POST')
            self.assertIn('test@hngroup.org.uk unlocked',output.getvalue())
            self.assertNotIn('a'*64,output.getvalue())

    def test_bad_email_does_not_make_request(self):
        with patch.object(horizon.os,'geteuid',return_value=0), patch.object(horizon,'unlock_pm2',return_value=True), patch('builtins.input',return_value='wrong'), patch.object(horizon.urllib.request,'build_opener') as opener, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(horizon.unlock_account(),1)
            opener.assert_not_called()
