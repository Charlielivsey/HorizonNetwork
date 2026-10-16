'use strict';
// Working tools that run entirely in the browser: nothing typed here is sent to the server.
window.HNTools = {
  mount(root, { h, toast, copyButton, section }) {
    const out = () => h('output', { class: 'out', 'aria-live': 'polite' });
    const tools = [];
    const add = (id, title, intro, ...kids) => tools.push(h('section', { class: 'panel tool reveal in', id: 'tool-' + id }, h('h2', {}, title), intro ? h('p', { class: 'muted small' }, intro) : null, ...kids));
    const randomInt = max => { const a = new Uint32Array(1); const limit = Math.floor(0x100000000 / max) * max; do crypto.getRandomValues(a); while (a[0] >= limit); return a[0] % max; };

    { // Password generator
      const length = h('input', { type: 'number', id: 'pw-len', min: 12, max: 128, value: 20 });
      const symbols = h('input', { type: 'checkbox', id: 'pw-sym', checked: true });
      const o = out();
      const gen = () => { const n = Math.min(128, Math.max(12, Number(length.value) || 20)); const set = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789' + (symbols.checked ? '!@#$%^&*()-_=+[]{};:,.?' : ''); o.textContent = Array.from({ length: n }, () => set[randomInt(set.length)]).join(''); };
      add('password', 'Password generator', 'Strong random passwords generated with your browser’s secure random number generator.', h('div', { class: 'toolbar' }, h('label', { for: 'pw-len' }, 'Length ', length), h('label', { class: 'check', for: 'pw-sym' }, symbols, 'Include symbols'), h('button', { class: 'btn small', type: 'button', onclick: gen }, 'Generate')), o, h('div', {}, h('button', { class: 'btn ghost small', type: 'button', onclick: () => navigator.clipboard.writeText(o.textContent).then(() => toast('Copied.')) }, 'Copy')));
      gen();
    }
    { // UUID
      const o = out();
      const gen = () => { o.textContent = Array.from({ length: 5 }, () => crypto.randomUUID()).join('\n'); };
      add('uuid', 'UUID generator', 'Five random version 4 UUIDs.', h('button', { class: 'btn small', type: 'button', onclick: gen }, 'Generate'), o); gen();
    }
    { // Contrast checker
      const fg = h('input', { type: 'color', id: 'cc-fg', value: '#5514b4' }), bg = h('input', { type: 'color', id: 'cc-bg', value: '#ffffff' });
      const sample = h('div', { class: 'contrast-sample' }, 'Sample text Aa'); const o = out();
      const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
      const calc = () => { const a = lum(fg.value), b = lum(bg.value); const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); sample.style.color = fg.value; sample.style.background = bg.value; o.textContent = `Contrast ratio ${ratio.toFixed(2)}:1\nNormal text: AA ${ratio >= 4.5 ? 'pass' : 'fail'} · AAA ${ratio >= 7 ? 'pass' : 'fail'}\nLarge text: AA ${ratio >= 3 ? 'pass' : 'fail'} · AAA ${ratio >= 4.5 ? 'pass' : 'fail'}`; };
      fg.addEventListener('input', calc); bg.addEventListener('input', calc);
      add('contrast', 'Colour contrast checker', 'Checks text and background colours against WCAG 2 contrast requirements.', h('div', { class: 'toolbar' }, h('label', { for: 'cc-fg' }, 'Text ', fg), h('label', { for: 'cc-bg' }, 'Background ', bg)), sample, o); calc();
    }
    { // JSON
      const input = h('textarea', { id: 'json-in', rows: 6, spellcheck: 'false', 'aria-label': 'JSON input' }); const o = out();
      const run = indent => { try { o.textContent = JSON.stringify(JSON.parse(input.value), null, indent); } catch (e) { o.textContent = 'Invalid JSON: ' + e.message; } };
      add('json', 'JSON formatter and validator', '', input, h('div', { class: 'toolbar' }, h('button', { class: 'btn small', type: 'button', onclick: () => run(2) }, 'Format'), h('button', { class: 'btn ghost small', type: 'button', onclick: () => run(0) }, 'Minify')), o);
    }
    { // Base64 & URL
      const input = h('textarea', { id: 'enc-in', rows: 3, 'aria-label': 'Text to encode or decode' }); const o = out();
      const b64e = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
      const b64d = s => new TextDecoder().decode(Uint8Array.from(atob(s.trim()), c => c.charCodeAt(0)));
      const run = fn => { try { o.textContent = fn(input.value); } catch { o.textContent = 'That input could not be converted.'; } };
      add('encode', 'Base64 and URL encoder', 'UTF-8 safe.', input, h('div', { class: 'toolbar' }, ...[['Base64 encode', b64e], ['Base64 decode', b64d], ['URL encode', encodeURIComponent], ['URL decode', decodeURIComponent]].map(([l, fn]) => h('button', { class: 'btn ghost small', type: 'button', onclick: () => run(fn) }, l))), o);
    }
    { // SHA-256
      const input = h('textarea', { id: 'hash-in', rows: 3, 'aria-label': 'Text to hash' }), file = h('input', { type: 'file', id: 'hash-file' }); const o = out();
      const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
      add('hash', 'SHA-256 checksum', 'Hash text, or a file to compare against a published checksum. Files are read locally.', input, h('button', { class: 'btn small', type: 'button', onclick: async () => { o.textContent = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.value))); } }, 'Hash text'),
        h('label', { for: 'hash-file' }, 'Or choose a file'), file, o);
      file.addEventListener('change', async () => { if (!file.files[0]) return; o.textContent = 'Hashing…'; o.textContent = file.files[0].name + '\n' + hex(await crypto.subtle.digest('SHA-256', await file.files[0].arrayBuffer())); });
    }
    { // Time
      const ts = h('input', { id: 'ts-in', placeholder: 'Unix timestamp or date, e.g. 1760000000 or 2026-10-16T09:30', 'aria-label': 'Timestamp or date' }); const o = out();
      const zones = ['Europe/London', 'UTC', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Asia/Kolkata', 'Asia/Singapore', 'Australia/Sydney'];
      const run = () => { const v = ts.value.trim(); const d = v === '' ? new Date() : /^\d{9,13}$/.test(v) ? new Date(Number(v) * (v.length > 10 ? 1 : 1000)) : new Date(v); if (Number.isNaN(d.getTime())) { o.textContent = 'Enter a valid timestamp or date.'; return; } o.textContent = [`Unix seconds: ${Math.floor(d.getTime() / 1000)}`, `ISO 8601 (UTC): ${d.toISOString()}`, ...zones.map(z => `${z}: ${d.toLocaleString('en-GB', { timeZone: z, dateStyle: 'medium', timeStyle: 'short' })}`)].join('\n'); };
      add('time', 'Time and time zone converter', 'Leave blank for now. Dates without a zone are read in your browser’s local time.', ts, h('button', { class: 'btn small', type: 'button', onclick: run }, 'Convert'), o); run();
    }
    { // Subnet
      const cidr = h('input', { id: 'cidr-in', placeholder: '192.168.1.0/24', 'aria-label': 'IPv4 network in CIDR notation' }); const o = out();
      const run = () => {
        const m = cidr.value.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
        if (!m || m.slice(1, 5).some(x => Number(x) > 255) || Number(m[5]) > 32) { o.textContent = 'Enter an IPv4 address with a prefix, e.g. 10.0.0.0/16'; return; }
        const ip = m.slice(1, 5).reduce((a, x) => (a * 256) + Number(x), 0), bits = Number(m[5]);
        const mask = bits ? (0xffffffff << (32 - bits)) >>> 0 : 0, net = (ip & mask) >>> 0, bc = (net | (~mask >>> 0)) >>> 0;
        const s = n => [24, 16, 8, 0].map(b => (n >>> b) & 255).join('.');
        const hosts = bits >= 31 ? 2 ** (32 - bits) : 2 ** (32 - bits) - 2;
        o.textContent = `Network: ${s(net)}/${bits}\nNetmask: ${s(mask)}\nBroadcast: ${s(bc)}\nUsable hosts: ${hosts.toLocaleString('en-GB')}\nRange: ${bits >= 31 ? s(net) + ' – ' + s(bc) : s(net + 1) + ' – ' + s(bc - 1)}`;
      };
      add('subnet', 'IPv4 subnet calculator', '', cidr, h('button', { class: 'btn small', type: 'button', onclick: run }, 'Calculate'), o);
    }
    { // Counter
      const t = h('textarea', { id: 'count-in', rows: 4, 'aria-label': 'Text to count' }); const o = out();
      const run = () => { const v = t.value; o.textContent = `${v.length} characters · ${v.trim() ? v.trim().split(/\s+/).length : 0} words · ${v ? v.split('\n').length : 0} lines · ${new TextEncoder().encode(v).length} bytes (UTF-8)`; };
      t.addEventListener('input', run); add('count', 'Word and character counter', '', t, o); run();
    }
    { // QR-free safe link checker: shows what a link really points to
      const u = h('input', { id: 'url-in', placeholder: 'https://example.com/path?x=1', 'aria-label': 'Web address to inspect' }); const o = out();
      const run = () => { try { const x = new URL(u.value.trim()); o.textContent = [`Protocol: ${x.protocol}`, `Host: ${x.hostname}`, x.hostname !== x.hostname.normalize('NFKC') || /xn--/.test(x.hostname) ? 'Warning: this host uses international (punycode) characters — check it carefully.' : 'Host uses plain characters.', `Path: ${x.pathname}`, ...[...x.searchParams].map(([k, v]) => `Parameter ${k} = ${v}`), x.username ? 'Warning: this link contains a username before the host.' : ''].filter(Boolean).join('\n'); } catch { o.textContent = 'Enter a full web address.'; } };
      add('url', 'Link inspector', 'Breaks a web address into its parts so you can see where it really leads before opening it.', u, h('button', { class: 'btn small', type: 'button', onclick: run }, 'Inspect'), o);
    }
    root.replaceChildren(h('div', { class: 'toolbar' }, ...tools.map(t => h('a', { class: 'btn ghost small', href: '#' + t.id, onclick: ev => { ev.preventDefault(); t.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); t.querySelector('input,textarea,button')?.focus({ preventScroll: true }); } }, t.querySelector('h2').textContent))), ...tools);
  }
};
