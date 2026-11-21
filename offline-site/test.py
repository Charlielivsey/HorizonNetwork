import http.server
import json
import pathlib
import socket
import subprocess
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
ROOT=pathlib.Path(__file__).resolve().parent

def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0))
        return sock.getsockname()[1]

class OfflineTests(unittest.TestCase):
    def test_all_brands_and_independent_nginx_fallback(self):
        class Upstream(http.server.BaseHTTPRequestHandler):
            status=200
            def do_GET(self):
                self.send_response(self.status);self.end_headers();self.wfile.write(b'Live site')
            def log_message(self,*args): pass
        backend=http.server.ThreadingHTTPServer(('127.0.0.1',0),Upstream)
        threading.Thread(target=backend.serve_forever,daemon=True).start()
        try:
            with tempfile.TemporaryDirectory() as name:
                folder=pathlib.Path(name);folder.chmod(0o755)
                subprocess.run(['node',str(ROOT/'build.cjs'),str(folder)],check=True)
                pages=list(folder.glob('*/index.html'))
                self.assertGreater(len(pages),30)
                for page in pages:
                    html=page.read_text()
                    self.assertIn('mailto:it@hngroup.org.uk',html)
                    logo=html.split('src="/__hn_offline/assets/')[1].split('"')[0]
                    self.assertTrue((folder/'assets'/logo).exists())
                self.assertIn('horizon-network-wordmark-white.svg',(folder/'network.hngroup.org.uk/index.html').read_text())
                self.assertNotIn('View service status',(folder/'status.hngroup.org.uk/index.html').read_text())
                port=free_port()
                snippet=(ROOT/'nginx.conf').read_text().replace('/var/www/hn-offline',str(folder))
                config=folder/'nginx.conf'
                config.write_text(f'pid {folder}/nginx.pid; error_log {folder}/error.log; events {{}} http {{ access_log off; include /etc/nginx/mime.types; server {{ listen 127.0.0.1:{port}; server_name _; {snippet} location / {{ proxy_pass http://127.0.0.1:{backend.server_port}; }} location /maintenance {{ proxy_intercept_errors off; proxy_pass http://127.0.0.1:{backend.server_port}; }} }} }}')
                process=subprocess.Popen(['nginx','-c',str(config),'-g','daemon off;'],stderr=subprocess.PIPE)
                def request(host,path='/'):
                    req=urllib.request.Request(f'http://127.0.0.1:{port}'+path,headers={'Host':host})
                    try:return urllib.request.urlopen(req,timeout=3)
                    except urllib.error.HTTPError as error:return error
                try:
                    for _ in range(50):
                        try:
                            with request('docs.hngroup.org.uk') as response:self.assertEqual(response.status,200)
                            break
                        except urllib.error.URLError:time.sleep(.05)
                    else:self.fail('nginx failed to start')
                    for status in (500,502,503,504):
                        Upstream.status=status
                        for host in ('docs.hngroup.org.uk','network.hngroup.org.uk','admin.hngroup.org.uk','status.hngroup.org.uk'):
                            with request(host,'/path?keep=query') as response:
                                self.assertEqual(response.status,503)
                                self.assertEqual(response.headers['Retry-After'],'60')
                                self.assertEqual(response.headers['Cache-Control'],'no-store')
                                self.assertIn(b'it@hngroup.org.uk',response.read())
                    with request('docs.hngroup.org.uk','/maintenance') as response:
                        self.assertEqual(response.status,504)
                        self.assertEqual(response.read(),b'Live site','deliberate maintenance responses remain intact')
                    Upstream.status=200
                    with request('docs.hngroup.org.uk') as response:self.assertEqual(response.status,200)
                    backend.shutdown();backend.server_close()
                    with request('finance.hngroup.org.uk') as response:self.assertEqual(response.status,503)
                    with request('finance.hngroup.org.uk','/__hn_offline/assets/plus-jakarta-sans.woff2') as response:self.assertEqual(response.status,200)
                finally:
                    process.terminate();process.communicate(timeout=5)
        finally:
            backend.shutdown();backend.server_close()

if __name__=='__main__':unittest.main()
