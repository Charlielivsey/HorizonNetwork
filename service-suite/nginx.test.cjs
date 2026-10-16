'use strict';
// Validates every generated nginx host with real nginx, then routes live traffic through one
// Horizon Network site: HTTP→HTTPS redirect, alias→primary redirect and HTTPS proxying.
//   node --test service-suite/nginx.test.cjs   (needs nginx and openssl; uses temporary files only)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync, execFile, spawn } = require('node:child_process');
const run = (cmd, args) => new Promise((ok, no) => execFile(cmd, args, (e, out) => e ? no(e) : ok(out)));
const ROOT = path.resolve(__dirname, '..');
const catalog = require('./catalog.json');
async function freePort() { const s = http.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r)); return p; }

function compose(id, mode, alias) { return execFileSync('python3', [path.join(__dirname, 'nginx-compose.py'), path.join(ROOT, id + '-site'), mode, ...(alias ? ['--alias'] : []), '--no-ipv6']).toString(); }
function localise(conf, dir, ports) {
  return conf.replaceAll('/etc/letsencrypt/live/', dir + '/certs/').replaceAll('/etc/nginx/hn-control/enabled/', dir + '/gates/').replaceAll('/var/www/', dir + '/www/')
    .replace(/listen 80;/g, `listen 127.0.0.1:${ports.http};`).replace(/listen 443 ssl;/g, `listen 127.0.0.1:${ports.https} ssl;`);
}
function setup(dir, names) {
  for (const d of ['certs', 'gates', 'www', 'logs', 'conf']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  for (const c of names) {
    const certDir = path.join(dir, 'certs', c.domain); fs.mkdirSync(certDir, { recursive: true });
    const san = [c.domain, ...(c.aliases || [])].map(n => 'DNS:' + n).join(',');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=' + c.domain, '-addext', 'subjectAltName=' + san, '-keyout', path.join(certDir, 'privkey.pem'), '-out', path.join(certDir, 'fullchain.pem')], { stdio: 'ignore' });
  }
}
function nginxConf(dir, includes) {
  return `pid ${dir}/nginx.pid;\nerror_log ${dir}/logs/error.log;\nevents {}\nhttp {\n  access_log off;\n  client_body_temp_path ${dir}/tmp_body; proxy_temp_path ${dir}/tmp_proxy; fastcgi_temp_path ${dir}/tmp_fcgi; uwsgi_temp_path ${dir}/tmp_uwsgi; scgi_temp_path ${dir}/tmp_scgi;\n  server_names_hash_bucket_size 128;\n${includes.map(f => '  include ' + f + ';').join('\n')}\n}\n`;
}

test('every site composes valid nginx hosts in pending and HTTPS modes (with gates)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-nginx-'));
  try {
    setup(dir, catalog);
    // Use the real central-control gate snippets.
    fs.writeFileSync(path.join(dir, 'edge'), 'e'.repeat(64));
    execFileSync(process.execPath, [path.join(ROOT, 'admin-site/write-gates.cjs')], { env: { ...process.env, CONTROL_NGINX_DIR: path.join(dir, 'gates'), CONTROL_EDGE_SECRET_FILE: path.join(dir, 'edge') } });
    for (const c of catalog) assert.ok(fs.existsSync(path.join(dir, 'gates', c.id + '-gate.conf')), 'gate for ' + c.id);
    for (const mode of ['pending', 'https']) {
      const files = catalog.map(c => { const f = path.join(dir, 'conf', `${c.id}-${mode}.conf`); fs.writeFileSync(f, localise(compose(c.id, mode, mode === 'https'), dir, { http: 18080, https: 18443 })); return f; });
      fs.writeFileSync(path.join(dir, 'nginx.conf'), nginxConf(dir, files));
      execFileSync('nginx', ['-t', '-q', '-p', dir, '-c', path.join(dir, 'nginx.conf')], { stdio: 'pipe' });
    }
    const https = compose('hosting', 'https', true);
    assert.match(https, /server_name hosting\.horizonetwork\.com;[\s\S]*return 301 https:\/\/hosting\.horizon-network\.co\.uk\$request_uri;/);
    assert.match(https, /include \/etc\/nginx\/hn-control\/enabled\/hosting-\*\.conf;/);
    const pending = compose('billing', 'pending');
    assert.match(pending, /return 503/);
    assert.ok(!pending.includes('listen 443'));
    assert.match(pending, /acme-challenge/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('live routing through nginx: HTTP→HTTPS, alias→primary over HTTPS, proxy to the site', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-nginx-live-'));
  const entry = catalog.find(c => c.id === 'hosting');
  const backend = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, host: req.headers.host, proto: req.headers['x-forwarded-proto'], ip: req.headers['x-real-ip'] })); });
  const backendPort = await freePort();
  await new Promise(r => backend.listen(backendPort, '127.0.0.1', r));
  const ports = { http: await freePort(), https: await freePort() };
  let nginx;
  try {
    setup(dir, [entry]);
    fs.mkdirSync(path.join(dir, 'www', 'hn-hosting-acme', '.well-known', 'acme-challenge'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'www', 'hn-hosting-acme', '.well-known', 'acme-challenge', 'token'), 'challenge-ok');
    // nginx workers read challenge files as an unprivileged user (as with /var/www on the server).
    fs.chmodSync(dir, 0o755); execFileSync('chmod', ['-R', 'a+rX', path.join(dir, 'www')]);
    const conf = path.join(dir, 'conf', 'hosting.conf');
    fs.writeFileSync(conf, localise(compose('hosting', 'https', true), dir, ports).replaceAll(`proxy_pass http://127.0.0.1:${entry.port};`, `proxy_pass http://127.0.0.1:${backendPort};`));
    fs.writeFileSync(path.join(dir, 'nginx.conf'), nginxConf(dir, [conf]).replace('events {}', 'daemon off;\nevents {}'));
    nginx = spawn('nginx', ['-p', dir, '-c', path.join(dir, 'nginx.conf')], { stdio: 'ignore' });
    for (let n = 0; n < 100; n++) { try { await new Promise((ok, no) => http.get({ host: '127.0.0.1', port: ports.http, path: '/', headers: { Host: 'x' } }, r => { r.resume(); ok(); }).on('error', no)); break; } catch { await new Promise(r => setTimeout(r, 50)); } }
    const curl = (...args) => execFileSync('curl', ['--noproxy', '*', '-sk', '-o', '/dev/null', '-w', '%{http_code} %{redirect_url}', ...args]).toString();
    assert.equal(curl('--resolve', `hosting.horizon-network.co.uk:${ports.http}:127.0.0.1`, `http://hosting.horizon-network.co.uk:${ports.http}/m?x=1`), '301 https://hosting.horizon-network.co.uk/m?x=1');
    assert.equal(curl('--resolve', `hosting.horizonetwork.com:${ports.http}:127.0.0.1`, `http://hosting.horizonetwork.com:${ports.http}/path`), '301 https://hosting.horizon-network.co.uk/path');
    assert.equal(curl('--resolve', `hosting.horizonetwork.com:${ports.https}:127.0.0.1`, `https://hosting.horizonetwork.com:${ports.https}/path`), '301 https://hosting.horizon-network.co.uk/path');
    const body = await run('curl', ['--noproxy', '*', '-sk', '--resolve', `hosting.horizon-network.co.uk:${ports.https}:127.0.0.1`, `https://hosting.horizon-network.co.uk:${ports.https}/healthz`]);
    let value; try { value = JSON.parse(body); } catch { throw new Error(body + '\n' + fs.readFileSync(path.join(dir, 'logs/error.log'), 'utf8').slice(-1500)); }
    assert.equal(value.proto, 'https');
    assert.match(value.host, /^hosting\.horizon-network\.co\.uk/);
    assert.equal(execFileSync('curl', ['--noproxy', '*', '-s', '--resolve', `hosting.horizonetwork.com:${ports.http}:127.0.0.1`, `http://hosting.horizonetwork.com:${ports.http}/.well-known/acme-challenge/token`]).toString(), 'challenge-ok', 'alias certificate challenges are reachable');
    const hsts = await run('curl', ['--noproxy', '*', '-skI', '--resolve', `hosting.horizon-network.co.uk:${ports.https}:127.0.0.1`, `https://hosting.horizon-network.co.uk:${ports.https}/healthz`]);
    assert.match(hsts, /strict-transport-security: max-age=15552000/i);
  } finally {
    if (nginx) { nginx.kill(); await new Promise(r => nginx.once('exit', r)); }
    await new Promise(r => backend.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
