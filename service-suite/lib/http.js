'use strict';
// Small request/response helpers shared by every module. Nothing here trusts the client.
const crypto = require('node:crypto');

const fail = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const token = () => crypto.randomBytes(32).toString('hex');
const id = () => crypto.randomBytes(12).toString('hex');
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const now = () => new Date().toISOString();

function json(res, status, value, cookies = []) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(cookies.length ? { 'Set-Cookie': cookies } : {}) });
  res.end(JSON.stringify(value));
}

async function body(req, limit = 65536) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw fail(415, 'JSON required.');
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw fail(413, 'This request is too large.'); chunks.push(chunk); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  catch { throw fail(400, 'Invalid request.'); }
}

function cookie(req, name) {
  return (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1) || '';
}
function setCookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax${maxAge === undefined ? '' : '; Max-Age=' + maxAge}`;
}

// Only nginx on loopback may supply the visitor's address.
function clientIp(req) {
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  return String(local ? (req.headers['x-real-ip'] || req.socket.remoteAddress) : req.socket.remoteAddress).slice(0, 60);
}

const limits = new Map();
function rate(req, bucket, max = 8, windowMs = 600000) {
  const key = bucket + '|' + clientIp(req), t = Date.now();
  if (limits.size > 20000) for (const [k, v] of limits) if (v.until < t) limits.delete(k);
  const entry = limits.get(key);
  if (!entry || entry.until < t) { limits.set(key, { count: 1, until: t + windowMs }); return; }
  entry.count++;
  if (entry.count > max) throw fail(429, 'Too many requests. Please wait a few minutes and try again.');
}

function text(value, max = 200, required = false, label = 'This field') {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw fail(400, label + ' must be text.');
  value = value.replace(/\r\n?/g, '\n').trim();
  if (required && !value) throw fail(400, label + ' is required.');
  if (value.length > max) throw fail(400, `${label} must be ${max} characters or fewer.`);
  return value;
}
function email(value, required = true, label = 'Email') {
  value = text(value, 160, required, label).toLowerCase();
  if (value && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)) throw fail(400, 'Enter a valid email address.');
  return value;
}

module.exports = { fail, token, id, hash, now, json, body, cookie, setCookie, clientIp, rate, text, email };
