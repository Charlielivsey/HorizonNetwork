"""Exercise Auth's actual fallback configuration in an isolated nginx instance."""
import http.server
import pathlib
import socket
import subprocess
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent


def port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


class OfflineTests(unittest.TestCase):
    def test_live_nginx_fallback_and_recovery(self):
        class Upstream(http.server.BaseHTTPRequestHandler):
            status = 200
            def do_GET(self):
                self.send_response(self.status)
                self.end_headers()
                self.wfile.write(b'Auth is available')
            def log_message(self, *args):
                pass
        backend = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Upstream)
        threading.Thread(target=backend.serve_forever, daemon=True).start()
        try:
            with tempfile.TemporaryDirectory() as name:
                folder = pathlib.Path(name)
                folder.chmod(0o755)
                (folder / 'index.html').write_bytes((ROOT / 'offline/index.html').read_bytes())
                (folder / 'hn-group-wordmark-white.svg').write_bytes((ROOT / 'public/assets/brand/hn-group-wordmark-white.svg').read_bytes())
                (folder / 'plus-jakarta-sans.woff2').write_bytes((ROOT / 'public/assets/fonts/plus-jakarta-sans.woff2').read_bytes())
                listen = port()
                # Reuse the real TLS server configuration; only transport, paths and gate are fixtures.
                server = (ROOT / 'nginx-auth.conf').read_text().split('server {', 2)[2]
                server = 'server {' + '\n'.join(line for line in server.splitlines() if 'ssl_' not in line and 'listen [::]' not in line and 'hn-control/enabled' not in line)
                server = server.replace('listen 443 ssl;', 'listen 127.0.0.1:' + str(listen) + ';')
                server = server.replace('/var/www/hn-auth-offline', str(folder))
                server = server.replace('127.0.0.1:3400', '127.0.0.1:' + str(backend.server_port))
                server = server.replace('client_max_body_size 32k;', 'client_max_body_size 32k; auth_request /fixture-gate; location = /fixture-gate { internal; auth_request off; return 204; }')
                config = folder / 'nginx.conf'
                config.write_text('pid ' + str(folder / 'nginx.pid') + '; error_log ' + str(folder / 'error.log') + '; events {} http { access_log off; include /etc/nginx/mime.types; ' + server + ' }')
                process = subprocess.Popen(['nginx', '-c', str(config), '-g', 'daemon off;'], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                def request(path='/'):
                    try:
                        return urllib.request.urlopen('http://127.0.0.1:' + str(listen) + path, timeout=3)
                    except urllib.error.HTTPError as error:
                        return error
                try:
                    for _ in range(50):
                        try:
                            with request() as response:
                                self.assertEqual(response.status, 200)
                            break
                        except urllib.error.URLError:
                            time.sleep(.05)
                    else:
                        self.fail('Isolated nginx did not start')
                    for status in (500, 502, 503, 504):
                        Upstream.status = status
                        with request('/?return=preserved') as response:
                            self.assertEqual(response.status, 503)
                            self.assertEqual(response.headers['Cache-Control'], 'no-store')
                            self.assertEqual(response.headers['Retry-After'], '60')
                            self.assertIn(b'Sign-in is temporarily offline.', response.read())
                    Upstream.status = 200
                    with request() as response:
                        self.assertEqual(response.status, 200)
                        self.assertEqual(response.read(), b'Auth is available')
                    backend.shutdown()
                    backend.server_close()
                    with request('/sign-in') as response:
                        self.assertEqual(response.status, 503)
                        self.assertIn(b'HN Group Auth', response.read())
                    for path in ('hn-group-wordmark-white.svg', 'plus-jakarta-sans.woff2'):
                        with request('/_hn-auth-offline/' + path) as response:
                            self.assertEqual(response.status, 200)
                            self.assertGreater(len(response.read()), 100)
                    # An unavailable central gate must also reach the independent static fallback.
                    config.write_text(config.read_text().replace('return 204;', 'return 500;'))
                    subprocess.run(['nginx', '-c', str(config), '-s', 'reload'], check=True, capture_output=True)
                    time.sleep(.15)
                    with request() as response:
                        self.assertEqual(response.status, 503)
                        self.assertIn(b'Sign-in is temporarily offline.', response.read())
                finally:
                    process.terminate()
                    process.communicate(timeout=5)
        finally:
            backend.shutdown()
            backend.server_close()


if __name__ == '__main__':
    unittest.main()
