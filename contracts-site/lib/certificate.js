'use strict';
// The signing certificate that goes with a completed contract: what was signed (its title, file and SHA-256
// fingerprint), who signed it, when, as what name and from where, and everything that happened to it. Drawn with the
// same PDF engine and HN Group letterhead as HN Group Docs (lib/pdf.js, a copy of docs-site/lib/pdf.js).
const { renderDocument } = require('./pdf');

const HN_GROUP = { id: 'hn-group', name: 'HN Group', legal: 'HN Group Limited', logo: 'hn-group-wordmark', note: '' };
const TEMPLATE = { label: 'Signing certificate', title: 'heading', layout: '', foot: [],
  head: [{ key: 'contract', label: 'Contract' }, { key: 'file', label: 'File' }, { key: 'fingerprint', label: 'SHA-256 fingerprint' }, { key: 'reference', label: 'Reference' },
    { key: 'sentBy', label: 'Sent by' }, { key: 'sent', label: 'Sent' }, { key: 'completed', label: 'Completed' }] };
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = (iso) => iso ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/London', timeZoneName: 'short' }).format(new Date(iso)) : '';

function certificate(c) {
  const rows = c.signers.map((s) => '<tr><td><strong>' + esc(s.name) + '</strong>' + (s.role ? '<br>' + esc(s.role) : '') + (s.jobTitle ? '<br>' + esc(s.jobTitle) + (s.company ? ', ' + esc(s.company) : '') : '') + '</td><td>' + esc(s.signature.typed) + '</td><td>' + esc(when(s.signedAt)) + '</td><td>' + esc(s.signature.email || '') + '<br>IP ' + esc(s.signature.ip || 'not recorded') + '</td></tr>').join('');
  const events = c.events.map((e) => '<tr><td>' + esc(when(e.at)) + '</td><td>' + esc(e.who) + '</td><td>' + esc(e.text) + '</td></tr>').join('');
  const body = '<p>This certificate records the electronic signing of the contract named above on HN Group Contracts (contracts.hngroup.org.uk). Each person signed in with their own HN Group Auth account, opened the contract, typed their name and confirmed that they had read it and agreed to sign it electronically.</p>' +
    '<p>The contract file was not changed. Every signature applies to the file with the SHA-256 fingerprint shown above; a copy of the contract with a different fingerprint is not the one that was signed.</p>' +
    '<h2>Signatures</h2><table><thead><tr><th>Signed by</th><th>Signature (typed name)</th><th>Signed</th><th>Account and IP address</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<h2>History</h2><table><thead><tr><th>When</th><th>Who</th><th>What happened</th></tr></thead><tbody>' + events + '</tbody></table>';
  return renderDocument({ title: 'Signing certificate', confidential: true, owner: 'HN Group Contracts', body,
    fields: { contract: c.title, file: c.file.name + ' (' + c.file.pages + ' page' + (c.file.pages === 1 ? '' : 's') + ')', fingerprint: c.file.sha256, reference: c.id.toUpperCase(),
      sentBy: c.createdBy.name, sent: when(c.sentAt), completed: when(c.completedAt) } }, HN_GROUP, TEMPLATE);
}
module.exports = { certificate };
