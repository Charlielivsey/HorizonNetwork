'use strict';
// Sends a message through HN Group's mail server on this VPS (Postfix's HN Mail-only port 127.0.0.1:10587). HN Mail
// signs in as the person's own mailbox (with its private master login); Postfix then checks the sender address is one
// that mailbox may send as (its own, or a shared mailbox it may send as) and refuses anything else, and Rspamd signs it
// with DKIM. The Bcc header is never sent (its addresses are only envelope recipients).
const net = require('node:net');
const fail = (status, message) => Object.assign(new Error(message), { status });

function send({ host = '127.0.0.1', port = 10587, user, pass, from, recipients, raw }) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    let buf = '', step = 0, rcpt = 0, done = false;
    const data = Buffer.from(stripBcc(raw).toString('latin1').replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..'), 'latin1');
    const finish = (err, value) => { if (done) return; done = true; socket.destroy(); err ? reject(err) : resolve(value); };
    const write = (line) => socket.write(line + '\r\n');
    socket.setTimeout(120000, () => finish(fail(504, 'The mail server took too long. Your message may not have been sent.')));
    socket.on('error', () => finish(fail(503, 'HN Group’s mail server can’t be reached right now. Your message wasn’t sent.')));
    socket.on('data', (d) => {
      buf += d.toString('latin1');
      let m;
      while ((m = /^(\d{3})([ -])(.*)\r?\n/m.exec(buf))) {
        buf = buf.slice(m.index + m[0].length);
        if (m[2] === '-') continue;
        const code = Number(m[1]), text = m[3];
        const refuse = (status, message) => finish(fail(status, message));
        if (step === 0) { if (code !== 220) return refuse(503, 'The mail server isn’t accepting mail right now.'); step = 1; write('EHLO hnmail.local'); }
        else if (step === 1) { if (code !== 250) return refuse(503, 'The mail server refused HN Mail.'); step = 2; write('AUTH PLAIN ' + Buffer.from('\0' + user + '\0' + pass).toString('base64')); }
        else if (step === 2) { if (code !== 235) return refuse(403, 'Your mailbox couldn’t sign in to send (it may be disabled).'); step = 3; write('MAIL FROM:<' + from + '> SIZE=' + data.length); }
        else if (step === 3) { if (code !== 250) return refuse(403, /not owned/i.test(text) ? 'You’re not allowed to send from ' + from + '.' : text.replace(/^\d\.\d\.\d\s*/, '')); step = 4; write('RCPT TO:<' + recipients[rcpt++] + '>'); }
        else if (step === 4) {
          if (code !== 250 && code !== 251) return refuse(400, 'The mail server refused ' + recipients[rcpt - 1] + ': ' + text.replace(/^\d\.\d\.\d\s*/, ''));
          if (rcpt < recipients.length) write('RCPT TO:<' + recipients[rcpt++] + '>'); else { step = 5; write('DATA'); }
        }
        else if (step === 5) { if (code !== 354) return refuse(502, 'The mail server didn’t take the message.'); step = 6; socket.write(data); write(data.subarray(-2).toString() === '\r\n' ? '.' : '\r\n.'); }
        else if (step === 6) { if (code !== 250) return refuse(code >= 500 ? 400 : 503, text.replace(/^\d\.\d\.\d\s*/, '') || 'The message was refused.'); step = 7; write('QUIT'); finish(null, { queued: (/queued as (\w+)/.exec(text) || [])[1] || '' }); }
      }
    });
  });
}
function stripBcc(raw) {
  const s = Buffer.isBuffer(raw) ? raw.toString('latin1') : String(raw);
  const i = s.search(/\r?\n\r?\n/);
  const head = s.slice(0, i), body = s.slice(i);
  return Buffer.from(head.replace(/^Bcc:.*(\r?\n[ \t].*)*\r?\n?/gim, '') + body, 'latin1');
}
module.exports = { send, stripBcc };
