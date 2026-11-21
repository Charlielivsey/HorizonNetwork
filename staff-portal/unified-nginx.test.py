"""Backend PIN errors remain JSON; real maintenance gates still hold requests."""
import http.server, threading, socket, tempfile, subprocess, urllib.request, urllib.error, pathlib
class Backend(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        code=403 if self.path=='/pin' else 204
        self.send_response(code);self.send_header('Content-Type','application/json');self.end_headers()
        if code==403:self.wfile.write(b'{"code":"PIN_REQUIRED"}')
    def log_message(self,*args):pass
global_temp=pathlib.Path('/var/lib/nginx');global_owners={str(p):(p.stat().st_uid,p.stat().st_gid) for p in global_temp.iterdir() if p.is_dir()}
server=http.server.HTTPServer(('127.0.0.1',0),Backend);threading.Thread(target=server.serve_forever,daemon=True).start()
s=socket.socket();s.bind(('127.0.0.1',0));port=s.getsockname()[1];s.close()
with tempfile.TemporaryDirectory(prefix='hn-pin-nginx-') as folder:
    config=pathlib.Path(folder)/'nginx.conf'
    config.write_text(f'''pid {folder}/pid; error_log {folder}/error.log; events{{}} http{{access_log off;client_body_temp_path {folder}/body;proxy_temp_path {folder}/proxy;fastcgi_temp_path {folder}/fastcgi;uwsgi_temp_path {folder}/uwsgi;scgi_temp_path {folder}/scgi;server{{listen 127.0.0.1:{port};proxy_intercept_errors on;error_page 403 = @hold;
    location /pin{{auth_request /allow;proxy_intercept_errors off;proxy_pass http://127.0.0.1:{server.server_port};}}
    location /blocked{{auth_request /deny;proxy_intercept_errors off;proxy_pass http://127.0.0.1:{server.server_port};}}
    location = /allow{{internal;return 204;}}location = /deny{{internal;proxy_intercept_errors off;proxy_pass http://127.0.0.1:{server.server_port}/pin;}}location @hold{{return 503 'Real maintenance';}}
    }}}}''')
    subprocess.run(['nginx','-c',str(config),'-p',folder],check=True)
    try:
        for route,code,text in [('/pin',403,'PIN_REQUIRED'),('/blocked',503,'Real maintenance')]:
            try:r=urllib.request.urlopen(f'http://127.0.0.1:{port}{route}')
            except urllib.error.HTTPError as e:r=e
            assert r.status==code,(route,r.status);assert text in r.read().decode()
        assert 'proxy_intercept_errors off;' in pathlib.Path('staff-portal/nginx-staff.conf').read_text()
        print('PASS: PIN error preserved; actual maintenance remains enforced.')
    finally:subprocess.run(['nginx','-c',str(config),'-p',folder,'-s','quit'],check=True)
server.shutdown()
assert global_owners=={str(p):(p.stat().st_uid,p.stat().st_gid) for p in global_temp.iterdir() if p.is_dir()}, 'Isolated nginx test must not change production temporary paths'
