'use strict';
// Keeps HN Group Auth's Discord bot online (the user's request, 28 October 2026: "need to start the bot"). The bot
// itself only looks people up (discord.js); this connection to Discord's gateway is what shows it as Online, watching
// HN Group sign-ins. It asks for no intents, so it receives no messages or server data.
//
// No dependencies: a small WebSocket client over TLS (Node 20 has no built-in WebSocket), heartbeats, and
// reconnecting with a growing delay when Discord closes the connection.
const tls = require('node:tls');
const crypto = require('node:crypto');

const GATEWAY = { host: 'gateway.discord.gg', path: '/?v=10&encoding=json' };
const FATAL = new Set([4004, 4010, 4011, 4012, 4013, 4014]); // bad token, sharding, bad intents: don't retry

// A minimal WebSocket client: text frames, ping/pong, close, fragmented messages.
function connect({ host, path, port, tlsOptions }, { onOpen, onMessage, onClose }) {
  const socket = tls.connect({ host, port: port || 443, servername: host, ALPNProtocols: ['http/1.1'], ...(tlsOptions || {}) });
  const key = crypto.randomBytes(16).toString('base64');
  let buffer = Buffer.alloc(0), open = false, parts = [], closed = false;
  const finish = (code) => { if (closed) return; closed = true; socket.destroy(); onClose(code); };
  socket.setTimeout(90000, () => finish(4900));
  socket.on('secureConnect', () => {
    socket.write(`GET ${path} HTTP/1.1\r\nHost: ${host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nUser-Agent: HN-Group-Auth (https://auth.hngroup.org.uk, 1.0)\r\n\r\n`);
  });
  socket.on('error', () => finish(4901));
  socket.on('close', () => finish(4902));
  function frame(op, payload) {
    const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload || '');
    const mask = crypto.randomBytes(4), len = data.length;
    const head = len < 126 ? Buffer.from([0x80 | op, 0x80 | len]) : len < 65536 ? Buffer.from([0x80 | op, 0xfe, len >> 8, len & 255]) : Buffer.concat([Buffer.from([0x80 | op, 0xff]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(len)); return b; })()]);
    const body = Buffer.alloc(len); for (let i = 0; i < len; i++) body[i] = data[i] ^ mask[i & 3];
    if (!socket.destroyed) socket.write(Buffer.concat([head, mask, body]));
  }
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (!open) {
      const end = buffer.indexOf('\r\n\r\n');
      if (end < 0) return;
      const head = buffer.slice(0, end).toString();
      const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      if (!/^HTTP\/1\.1 101/.test(head) || !head.toLowerCase().includes('sec-websocket-accept: ' + accept.toLowerCase())) return finish(4903);
      open = true; buffer = buffer.slice(end + 4); onOpen();
    }
    while (buffer.length >= 2) {
      const fin = buffer[0] & 0x80, op = buffer[0] & 0x0f;
      let len = buffer[1] & 0x7f, offset = 2;
      if (len === 126) { if (buffer.length < 4) return; len = buffer.readUInt16BE(2); offset = 4; }
      else if (len === 127) { if (buffer.length < 10) return; len = Number(buffer.readBigUInt64BE(2)); offset = 10; }
      if (len > 16 * 1024 * 1024) return finish(4904);
      if (buffer.length < offset + len) return;
      const payload = buffer.slice(offset, offset + len);
      buffer = buffer.slice(offset + len);
      if (op === 0x8) return finish(payload.length >= 2 ? payload.readUInt16BE(0) : 1005);
      if (op === 0x9) { frame(0xa, payload); continue; }
      if (op === 0xa) continue;
      if (op === 0x1 || op === 0x2 || op === 0x0) {
        parts.push(payload);
        if (fin) { const text = Buffer.concat(parts).toString('utf8'); parts = []; onMessage(text); }
      }
    }
  });
  return { send: (text) => frame(0x1, text), close: () => { frame(0x8, Buffer.from([0x03, 0xe8])); setTimeout(() => finish(1000), 500).unref(); } };
}

// Keeps the bot online for as long as `token()` returns a token (checked every minute, so adding or changing the
// token in discord.json takes effect without a restart).
function startPresence(token, { log = console, gateway = GATEWAY } = {}) {
  let ws = null, current = null, heartbeat = null, seq = null, acked = true, retry = 0, stopped = false, fatal = null;
  function stop(reason) {
    clearInterval(heartbeat); heartbeat = null;
    if (ws) { const w = ws; ws = null; w.close(); }
    if (reason) log.log('Discord bot offline: ' + reason);
  }
  function start(t) {
    current = t; acked = true; seq = null;
    ws = connect(gateway, {
      onOpen() {},
      onMessage(text) {
        let msg; try { msg = JSON.parse(text); } catch { return; }
        if (msg.s != null) seq = msg.s;
        if (msg.op === 10) {
          clearInterval(heartbeat);
          const every = Math.max(5000, Number(msg.d && msg.d.heartbeat_interval) || 41250);
          heartbeat = setInterval(() => {
            if (!acked) { stop(); schedule(); return; } // no reply to the last heartbeat: reconnect
            acked = false; ws && ws.send(JSON.stringify({ op: 1, d: seq }));
          }, every);
          heartbeat.unref();
          ws.send(JSON.stringify({ op: 2, d: { token: t, intents: 0, properties: { os: 'linux', browser: 'hn-group-auth', device: 'hn-group-auth' },
            presence: { status: 'online', afk: false, since: null, activities: [{ name: 'HN Group sign-ins', type: 3 }] } } }));
        } else if (msg.op === 11) acked = true;
        else if (msg.op === 1) ws && ws.send(JSON.stringify({ op: 1, d: seq }));
        else if (msg.op === 0 && msg.t === 'READY') { retry = 0; log.log('Discord bot online as ' + ((msg.d && msg.d.user && msg.d.user.username) || 'the HN Group bot') + '.'); }
        else if (msg.op === 7 || msg.op === 9) { stop(); schedule(msg.op === 9 ? 5000 : 1000); }
      },
      onClose(code) {
        clearInterval(heartbeat); heartbeat = null; ws = null;
        if (stopped) return;
        if (FATAL.has(code)) { fatal = current; log.log('Discord bot can’t connect (Discord closed with ' + code + (code === 4004 ? ': the bot token isn’t valid' : '') + '). Fix discord.json and it will try again.'); return; }
        schedule();
      },
    });
  }
  let timer = null;
  function schedule(delay) {
    clearTimeout(timer);
    const wait = delay || Math.min(5 * 60000, 2000 * 2 ** Math.min(retry++, 8));
    timer = setTimeout(() => { const t = token(); if (t && !stopped && t !== fatal) start(t); }, wait);
    timer.unref();
  }
  // Starts, restarts or stops when the token appears, changes or goes away.
  function check() {
    const t = token();
    if (!t) { if (ws) stop('no bot token'); current = null; return; }
    if (t === fatal) return;
    if (t !== current || (!ws && !timer)) { stop(); fatal = null; retry = 0; start(t); }
  }
  check();
  const watcher = setInterval(check, 60000); watcher.unref();
  return { stop() { stopped = true; clearInterval(watcher); clearTimeout(timer); stop(); }, check };
}

module.exports = { startPresence, connect };
