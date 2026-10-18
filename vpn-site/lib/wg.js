'use strict';
// Controls the WireGuard interface (wg-hn) that carries staff VPN traffic. Peers are kept in the
// VPN service's own data and applied to the interface with `wg set`, so the interface always matches
// the registered devices, including after a reboot. VPN_WG_FAKE=1 keeps peers in memory for tests.
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const IFACE = process.env.VPN_INTERFACE || 'wg-hn';
const FAKE = process.env.VPN_WG_FAKE === '1';
const KEY = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw480]=$/;
const fake = { peers: new Map(), publicKey: 'c2VydmVyLXB1YmxpYy1rZXktZm9yLXRlc3RzLW9ubHk=' };

function run(args, input) {
  return new Promise((resolve, reject) => {
    const child = execFile('wg', args, { timeout: 10000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(new Error(String(stderr || err.message).trim() || 'WireGuard command failed.'), { status: 503 }));
      else resolve(String(stdout));
    });
    if (input !== undefined) child.stdin.end(input);
  });
}

async function serverPublicKey() {
  if (FAKE) return fake.publicKey;
  return (await run(['show', IFACE, 'public-key'])).trim();
}

// A new key pair, for devices that can't make their own (such as phones added from the website).
async function keyPair() {
  if (FAKE) { const k = require('node:crypto').randomBytes(32).toString('base64'); return { privateKey: k, publicKey: require('node:crypto').createHash('sha256').update(k).digest('base64') }; }
  const privateKey = (await run(['genkey'])).trim();
  const publicKey = (await run(['pubkey'], privateKey + '\n')).trim();
  return { privateKey, publicKey };
}
async function presharedKey() {
  if (FAKE) return require('node:crypto').randomBytes(32).toString('base64');
  return (await run(['genpsk'])).trim();
}

async function addPeer(d) {
  if (!KEY.test(d.publicKey) || !KEY.test(d.presharedKey)) throw Object.assign(new Error('Invalid device key.'), { status: 400 });
  const allowed = d.ipv4 + '/32,' + d.ipv6 + '/128';
  if (FAKE) { fake.peers.set(d.publicKey, { allowed, handshake: 0, rx: 0, tx: 0 }); return; }
  // The preshared key goes through a private temporary file, never the command line.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-vpn-'));
  const pskFile = path.join(tmp, 'psk');
  try {
    fs.writeFileSync(pskFile, d.presharedKey + '\n', { mode: 0o600 });
    await run(['set', IFACE, 'peer', d.publicKey, 'preshared-key', pskFile, 'allowed-ips', allowed]);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

async function removePeer(publicKey) {
  if (FAKE) { fake.peers.delete(publicKey); return; }
  await run(['set', IFACE, 'peer', publicKey, 'remove']);
}

// Each peer on the interface: { publicKey: { handshake (ms since epoch, 0 = never), rx, tx, endpoint } }.
async function peers() {
  if (FAKE) return Object.fromEntries([...fake.peers].map(([k, v]) => [k, { handshake: v.handshake, rx: v.rx, tx: v.tx, endpoint: '' }]));
  const out = {};
  const lines = (await run(['show', IFACE, 'dump'])).trim().split('\n').slice(1);
  for (const line of lines) {
    const [pub, , endpoint, , handshake, rx, tx] = line.split('\t');
    if (pub) out[pub] = { handshake: Number(handshake) * 1000, rx: Number(rx), tx: Number(tx), endpoint: endpoint === '(none)' ? '' : endpoint };
  }
  return out;
}

// Makes the interface's peers match the registered devices exactly.
async function reconcile(devices) {
  const now = await peers();
  const wanted = new Map(devices.map((d) => [d.publicKey, d]));
  for (const pub of Object.keys(now)) if (!wanted.has(pub)) await removePeer(pub);
  for (const d of devices) await addPeer(d);
}

module.exports = { IFACE, KEY, serverPublicKey, keyPair, presharedKey, addPeer, removePeer, peers, reconcile, fake };
