'use strict';
// Images staff upload to the wiki, and each company's logo. Files are kept in DATA_DIR/uploads under
// random names; DATA_DIR/media.json records what each one is called on the wiki, who uploaded it and
// when. A company's logo can be replaced (with an optional white version for dark backgrounds) and the
// change shows everywhere the company appears at once.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };
let dir, file, data;

function init(dataDir) {
  dir = path.join(dataDir, 'uploads'); file = path.join(dataDir, 'media.json');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = {}; }
  data.files = data.files || {}; data.logos = data.logos || {}; data.log = data.log || [];
}
function save() { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 }); fs.renameSync(tmp, file); }
const bad = (message) => Object.assign(new Error(message), { status: 400 });

// Works out what an uploaded image really is from its first bytes (not its name), and refuses anything
// else. SVGs must be plain drawings: no scripts, event handlers, external links or embedded pages.
function detect(buffer) {
  const b = buffer;
  if (b.length > 8 && b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (b.length > 6 && /^GIF8[79]a/.test(b.toString('latin1', 0, 6))) return 'gif';
  const text = b.toString('utf8', 0, Math.min(b.length, 2000)).replace(/^﻿/, '').trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(text)) {
    const all = b.toString('utf8');
    if (/<script|<foreignObject|<iframe|<embed|<object|\son\w+\s*=|javascript:|data:text\/html|<!ENTITY|xlink:href\s*=\s*["'](?!#)|\shref\s*=\s*["'](?!#)/i.test(all)) throw bad('That SVG contains scripts or links, which aren’t allowed. Save it as a plain image and try again.');
    return 'svg';
  }
  return null;
}
function fromDataUrl(dataUrl) {
  const m = /^data:[\w.+/-]*;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw bad('Choose an image to upload.');
  const buffer = Buffer.from(m[1], 'base64');
  if (!buffer.length) throw bad('That file is empty.');
  if (buffer.length > MAX_BYTES) throw bad('That image is too large. The limit is 4 MB.');
  const type = detect(buffer);
  if (!type) throw bad('Upload a PNG, JPEG, WebP, GIF or SVG image.');
  return { buffer, type };
}
function store(buffer, type) {
  const name = crypto.randomBytes(12).toString('hex') + '.' + type;
  fs.writeFileSync(path.join(dir, name), buffer, { mode: 0o600 });
  return name;
}
const author = (a) => ({ id: String(a && a.id || ''), name: String(a && a.name || 'Staff editor').slice(0, 80) });
function log(entry) { data.log.unshift({ at: new Date().toISOString(), ...entry }); data.log = data.log.slice(0, 300); }

// The name an image is used by in articles: [[File:Name.png]].
function cleanName(raw, type) {
  let base = String(raw || '').trim().replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'image';
  let name = base + '.' + type, n = 2;
  while (data.files[name]) name = base + '-' + n++ + '.' + type;
  return name;
}

function addImage(dataUrl, wanted, description, who) {
  const { buffer, type } = fromDataUrl(dataUrl);
  const name = cleanName(wanted, type === 'jpg' ? 'jpg' : type);
  data.files[name] = { file: store(buffer, type), type, size: buffer.length, description: String(description || '').trim().slice(0, 300), by: author(who), at: new Date().toISOString() };
  log({ kind: 'upload', name, by: author(who) });
  save();
  return name;
}
function removeImage(name, who) {
  const f = data.files[name]; if (!f) return false;
  delete data.files[name]; fs.rmSync(path.join(dir, f.file), { force: true });
  log({ kind: 'delete', name, by: author(who) }); save(); return true;
}
const images = () => Object.entries(data.files).map(([name, f]) => ({ name, ...f })).sort((a, b) => b.at.localeCompare(a.at));
const image = (name) => data.files[name] || null;

// Company logos. light is shown on light backgrounds; dark (optional) on dark ones.
function setLogo(slug, input, who) {
  const current = data.logos[slug] || {};
  const next = { light: current.light || null, dark: current.dark || null };
  if (input.light) { const { buffer, type } = fromDataUrl(input.light); next.light = store(buffer, type); }
  if (input.dark) { const { buffer, type } = fromDataUrl(input.dark); next.dark = store(buffer, type); }
  if (input.removeDark) next.dark = null;
  if (!next.light) throw bad('Choose the logo image.');
  data.logos[slug] = { ...next, by: author(who), at: new Date().toISOString() };
  log({ kind: 'logo', company: slug, by: author(who) });
  save();
  return data.logos[slug];
}
function resetLogo(slug, who) { if (!data.logos[slug]) return false; delete data.logos[slug]; log({ kind: 'logo-reset', company: slug, by: author(who) }); save(); return true; }
const logo = (slug) => data.logos[slug] || null;
const history = () => data.log.slice();
// Changes whenever a logo or image changes, so cached pages are redrawn.
const version = () => String(data.log.length) + ':' + (data.log[0] ? data.log[0].at : '');
// The stored file behind an /w/upload/ address.
function filePath(stored) {
  if (!/^[a-f0-9]{24}\.(png|jpg|webp|gif|svg)$/.test(stored || '')) return null;
  const p = path.join(dir, stored);
  return fs.existsSync(p) ? { path: p, type: TYPES[stored.split('.').pop()] } : null;
}

module.exports = { init, addImage, removeImage, images, image, setLogo, resetLogo, logo, history, version, filePath, detect };
