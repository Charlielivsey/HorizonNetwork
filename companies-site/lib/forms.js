'use strict';
// Reads form posts: URL-encoded forms, and multipart forms carrying one PDF upload.
const MAX_FORM = 64 * 1024;
const MAX_UPLOAD = 15 * 1024 * 1024;

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('That upload is too large. The limit is ' + Math.round(limit / 1048576) + ' MB.'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Returns { fields, file } where file is a Buffer holding a PDF (or null when none was chosen).
async function parse(req) {
  const type = String(req.headers['content-type'] || '');
  if (type.startsWith('application/x-www-form-urlencoded')) {
    const body = await readBody(req, MAX_FORM);
    // Browsers send line breaks as CRLF; store plain newlines.
    return { fields: Object.fromEntries([...new URLSearchParams(body.toString('utf8'))].map(([k, v]) => [k, v.replace(/\r\n?/g, '\n')])), file: null };
  }
  const m = /^multipart\/form-data;\s*boundary=(?:"([^"]+)"|([^\s;]+))/i.exec(type);
  if (!m) throw Object.assign(new Error('Unsupported form.'), { status: 415 });
  const boundary = Buffer.from('--' + (m[1] || m[2]));
  const body = await readBody(req, MAX_UPLOAD + MAX_FORM);
  const fields = {}; let file = null;
  let pos = body.indexOf(boundary);
  while (pos !== -1) {
    const start = pos + boundary.length;
    if (body.slice(start, start + 2).toString() === '--') break;
    const headerEnd = body.indexOf('\r\n\r\n', start);
    const next = body.indexOf(boundary, headerEnd);
    if (headerEnd === -1 || next === -1) break;
    const headers = body.slice(start + 2, headerEnd).toString('utf8');
    const content = body.slice(headerEnd + 4, next - 2);
    const name = /name="([^"]*)"/i.exec(headers)?.[1];
    const isFile = /filename="([^"]*)"/i.exec(headers);
    if (name && isFile) {
      if (content.length) {
        if (content.length > MAX_UPLOAD) throw Object.assign(new Error('That PDF is too large. The limit is 15 MB.'), { status: 413 });
        if (content.slice(0, 5).toString('latin1') !== '%PDF-') throw Object.assign(new Error('Upload a PDF file.'), { status: 400 });
        file = content;
      }
    } else if (name && Object.keys(fields).length < 50) {
      fields[name] = content.toString('utf8').replace(/\r\n?/g, '\n').slice(0, 10000);
    }
    pos = next;
  }
  return { fields, file };
}

module.exports = { parse };
