// Live, read-only links into Docs and Contracts. The owning service keeps the file and its lifecycle.
const fs = require('node:fs');
const storage = require('./storage-access');
const contractsBackend = process.env.CONTRACTS_BACKEND || 'http://127.0.0.1:5560';
const secretFile = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
const error = (status, message) => Object.assign(new Error(message), { status });
const canReadDocs = (me, personId) => me.id === personId || storage.canOpen(me, personId);
async function fromContracts(personId, me, suffix = '') {
  let key = ''; try { key = fs.readFileSync(secretFile, 'utf8').trim(); } catch {}
  if (!/^[a-f0-9]{64}$/.test(key)) throw error(503, 'Contracts is unavailable.');
  let r;
  try { r = await fetch(contractsBackend + '/api/service/staff/' + encodeURIComponent(personId) + suffix + '?by=' + encodeURIComponent(me.displayName || ''), {
    headers: { Authorization: 'Bearer ' + key }, redirect: 'error', signal: AbortSignal.timeout(20000) }); }
  catch { throw error(503, 'Contracts is unavailable.'); }
  if (!r.ok) throw error(r.status === 404 ? 404 : 503, 'Contracts is unavailable.');
  return { type: r.headers.get('content-type'), disposition: r.headers.get('content-disposition'), body: Buffer.from(await r.arrayBuffer()) };
}
async function listing(personId, me) {
  const files = [], unavailable = [];
  await Promise.all([
    (async () => {
      if (!canReadDocs(me, personId)) return;
      try {
        const d = await storage.storageOf(personId, me);
        for (const item of d.documents) files.push({ id: 'docs-' + item.id, linked: 'documents', source: 'Docs', sourceId: item.id, title: item.title,
          category: 'Document', ext: 'pdf', inline: true, status: item.status, uploadedAt: new Date(item.updatedAt).toISOString(), uploadedByName: item.owner });
        for (const item of d.files) files.push({ id: 'docs-file-' + item.id, linked: 'files', source: 'Docs', sourceId: item.id, title: item.name,
          category: 'File', ext: item.name.split('.').pop().toLowerCase(), inline: item.mime === 'application/pdf' || /^image\//.test(item.mime), size: item.size,
          uploadedAt: new Date(item.updatedAt).toISOString(), uploadedByName: item.owner });
      } catch { unavailable.push('Docs'); }
    })(),
    (async () => {
      try {
        const d = JSON.parse((await fromContracts(personId, me)).body.toString('utf8'));
        for (const item of d.contracts) files.push({ id: 'contract-' + item.id, linked: 'contracts', source: 'Contracts', sourceId: item.id, title: item.title,
          category: 'Contract', ext: 'pdf', inline: true, status: item.status, uploadedAt: item.completedAt || item.sentAt || item.createdAt, uploadedByName: item.sender });
      } catch { unavailable.push('Contracts'); }
    })(),
  ]);
  return { files: files.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)), unavailable };
}
async function read(personId, source, id, me, download) {
  if (source === 'contracts') return fromContracts(personId, me, '/' + id + '/file' + (download ? '/download' : ''));
  if (!canReadDocs(me, personId)) throw error(403, "You don't have access to this person's storage.");
  const d = await storage.storageOf(personId, me);
  if (!(source === 'documents' ? d.documents : d.files).some(x => x.id === id)) throw error(404, 'Document not found.');
  return storage.fromDocs('/api/service/' + source + '/' + id + (source === 'documents' ? '/pdf' : ''), me, download ? { download: '1' } : {});
}
module.exports = { listing, read, canReadDocs };
