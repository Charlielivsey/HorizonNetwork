'use strict';
// Checks each hosted domain's public email records (MX, SPF, DKIM, DMARC) against this mail server, for the admin
// site's Domains page. Public DNS only (1.1.1.1 / 8.8.8.8); the DKIM public keys come from the server itself
// (/etc/hn-mail/dkim/public.json, written by mail-server/install.sh). Never changes DNS.
const fs = require('node:fs');
const { Resolver } = require('node:dns').promises;

const HOST = 'mx.hngroup.org.uk';
const IP = process.env.HN_MAIL_PUBLIC_IP || '217.154.34.205';

function createDnsCheck({ etc = process.env.HN_MAIL_ETC || '/etc/hn-mail', servers = ['1.1.1.1', '8.8.8.8'] } = {}) {
  const resolver = new Resolver({ timeout: 4000, tries: 2 });
  try { resolver.setServers(servers); } catch {}
  const txt = async (name) => { try { return (await resolver.resolveTxt(name)).map((parts) => parts.join('')); } catch { return []; } };
  const mx = async (name) => { try { return (await resolver.resolveMx(name)).sort((a, b) => a.priority - b.priority); } catch { return []; } };
  const a = async (name) => { try { return await resolver.resolve4(name); } catch { return []; } };
  const ptr = async (ip) => { try { return await resolver.reverse(ip); } catch { return []; } };
  let cache = { at: 0, value: null };

  function publicKeys() { try { return JSON.parse(fs.readFileSync(etc + '/dkim/public.json', 'utf8')); } catch { return {}; } }

  async function domain(d, keys) {
    const [mxs, rootTxt, dmarcTxt] = await Promise.all([mx(d), txt(d), txt('_dmarc.' + d)]);
    const sel = (keys[d] && keys[d].selector) || 'hn2026';
    const dkimTxt = await txt(sel + '._domainkey.' + d);
    const spf = rootTxt.filter((t) => /^v=spf1\b/i.test(t));
    const dmarc = dmarcTxt.filter((t) => /^v=DMARC1\b/i.test(t));
    const expectedKey = keys[d] && keys[d].dkim ? (/p=([A-Za-z0-9+/=]+)/.exec(keys[d].dkim.replace(/\s/g, '')) || [])[1] : null;
    const publishedKey = dkimTxt.map((t) => (/p=([A-Za-z0-9+/=]+)/.exec(t.replace(/\s/g, '')) || [])[1]).find(Boolean) || null;
    const ours = mxs.some((m) => m.exchange.replace(/\.$/, '').toLowerCase() === HOST);
    const google = mxs.some((m) => /google\.com\.?$/i.test(m.exchange));
    const spfText = spf[0] || '';
    const spfAuthorises = /\bip4:217\.154\.34\.205\b/.test(spfText) || (ours && /(^|\s)[+]?mx(\s|$)/.test(spfText));
    const checks = {
      mx: { ok: ours && !google, value: mxs.map((m) => m.priority + ' ' + m.exchange).join(', ') || 'none', note: ours ? (google ? 'Still includes Google' : 'Points to this server') : google ? 'Still Google Workspace' : 'Not this server' },
      spf: { ok: spf.length === 1 && spfAuthorises && !/_:\/\//.test(spfText), value: spf.join(' | ') || 'none',
        note: spf.length > 1 ? 'More than one SPF record: SPF fails until there is only one' : !spf.length ? 'No SPF record' : /_:\/\//.test(spfText) ? 'Contains a broken include (_://…), so SPF is invalid' : spfAuthorises ? 'Authorises this server' : 'Doesn’t authorise this server yet' },
      dkim: { ok: !!expectedKey && publishedKey === expectedKey, value: publishedKey ? sel + '._domainkey: published' : 'not published', note: !expectedKey ? 'No key on the server yet (run mail-server/install.sh)' : publishedKey === expectedKey ? 'Matches the server’s key' : publishedKey ? 'Published key doesn’t match the server’s' : 'Not published yet' },
      dmarc: { ok: dmarc.length === 1, value: dmarc.join(' | ') || 'none', note: dmarc.length > 1 ? 'More than one DMARC record' : dmarc.length ? 'Present' : 'No DMARC record' },
    };
    return { domain: d, checks, expected: { mx: '10 ' + HOST, dkimName: sel + '._domainkey.' + d, dkim: keys[d] ? keys[d].dkim : null } };
  }
  async function all(domains, { fresh = false } = {}) {
    if (!fresh && cache.value && Date.now() - cache.at < 120000) return cache.value;
    const keys = publicKeys();
    const [list, host, rev] = await Promise.all([Promise.all(domains.map((d) => domain(d, keys))), a(HOST), ptr(IP)]);
    cache = { at: Date.now(), value: { checked: new Date().toISOString(), host: { name: HOST, a: host, ok: host.includes(IP) }, ptr: { ip: IP, value: rev, ok: rev.map((x) => x.replace(/\.$/, '')).includes(HOST) }, domains: list } };
    return cache.value;
  }
  return { all };
}
module.exports = { createDnsCheck, HOST, IP };
