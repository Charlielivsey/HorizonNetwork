'use strict';
// The HN Group email signature for whoever is signed in (the user's request, 6 November 2026: "when gmail signature
// isnt selected it should automatically import the correct signature for whoever is signed in"). The same layout as
// the staff portal's signature maker (staff-portal/public/assets/app.js signatureHtml): logo on the left, details on
// the right, the eight-colour stripe, the parent company line and the confidentiality notice. Signatures use the full
// legal name (first and last name), as the project's naming rule says.
const LOGO_BASE = 'https://staff.hngroup.org.uk/assets/brand/png/';
const COMPANIES = {
  'HN Group': { logo: 'hn-group-email-logo', accent: '#5514B4', web: 'hngroup.org.uk', legal: 'HN Group Limited' },
  'Horizon Network': { logo: 'horizon-network-email-logo', accent: '#5514B4', web: 'network.hngroup.org.uk', legal: 'Horizon Network Limited', parent: 'HN Group', parentLegal: 'HN Group Limited' },
  'Horizon Advertising': { logo: 'horizon-advertising-email-logo', accent: '#7B52C4', web: 'horizonadvertising.co.uk', legal: 'Horizon Advertising Limited', parent: 'Horizon Media Group', parentLegal: 'Horizon Media Group Limited' },
  'Horizon Development': { logo: 'horizon-development-email-logo', accent: '#5514B4', web: 'development.hngroup.org.uk', legal: 'Horizon Development', parent: 'Horizon Network', parentLegal: 'Horizon Network Limited' },
  'Horizon Media Group': { logo: 'horizon-media-group-email-logo', accent: '#5514B4', web: 'hngroup.org.uk', legal: 'Horizon Media Group Limited', parent: 'HN Group', parentLegal: 'HN Group Limited' },
};
const STRIPE = [['#E97DE8', 14], ['#5514B4', 14], ['#E3E65B', 6], ['#3E9BA3', 20], ['#7A1F6C', 10], ['#C2306B', 10], ['#5FAE7B', 13], ['#1C2235', 13]];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function hnSignature({ firstName, lastName, displayName, jobTitle, company, email }) {
  const c = COMPANIES[company] || COMPANIES['HN Group'];
  const name = [firstName, lastName].filter(Boolean).join(' ') || displayName || '';
  const href = 'https://' + c.web;
  const line = (letter, inner) => '<span style="color:#1A1A1A;font-weight:bold;">' + letter + '</span>&nbsp; ' + inner;
  const lines = [];
  if (email) lines.push(line('E', '<a href="mailto:' + esc(email) + '" style="color:#4A4A4A;text-decoration:none;">' + esc(email) + '</a>'));
  lines.push(line('W', '<a href="' + esc(href) + '" style="color:#4A4A4A;text-decoration:none;">' + esc(c.web) + '</a>'));
  const label = COMPANIES[company] ? company : 'HN Group';
  return '<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;max-width:560px;">' +
    '<tr><td valign="middle" style="padding:0 20px 0 0;width:200px;border-right:2px solid ' + c.accent + ';">' +
    '<a href="' + esc(href) + '" style="text-decoration:none;"><img src="' + LOGO_BASE + c.logo + '.png" width="200" height="100" alt="' + esc(label) + '" style="display:block;border:0;width:200px;height:100px;"></a></td>' +
    '<td valign="middle" style="padding:0 0 0 20px;">' +
    '<p style="margin:0;font-size:17px;line-height:22px;font-weight:bold;color:#1A1A1A;">' + esc(name) + '</p>' +
    (jobTitle ? '<p style="margin:4px 0 10px;font-size:12px;line-height:18px;"><span style="color:' + c.accent + ';font-weight:bold;">' + esc(jobTitle) + '</span> &nbsp;<span style="color:#4A4A4A;">' + esc(c.legal) + '</span></p>'
      : '<p style="margin:4px 0 10px;font-size:12px;line-height:18px;color:#4A4A4A;">' + esc(c.legal) + '</p>') +
    '<p style="margin:0;font-size:12px;line-height:19px;color:#4A4A4A;">' + lines.join('<br>') + '</p></td></tr>' +
    '<tr><td colspan="2" style="padding:14px 0 0;"><table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%" style="border-collapse:collapse;"><tr>' +
    STRIPE.map(([colour, width]) => '<td height="3" width="' + width + '%" bgcolor="' + colour + '" style="font-size:0;line-height:0;">&nbsp;</td>').join('') + '</tr></table></td></tr>' +
    (c.parent ? '<tr><td colspan="2" style="padding:10px 0 0;font-size:11px;line-height:18px;color:#1A1A1A;">A <strong>' + esc(c.parent) + '</strong> company</td></tr>' : '') +
    '<tr><td colspan="2" style="padding:12px 0 0;font-size:10px;line-height:14px;color:#9A9A9A;">This email and any attachments are confidential and intended only for the named recipient. If you have received it in error, please tell the sender and delete it.' +
    (c.parent ? ' ' + esc(label) + ' is a subsidiary of ' + esc(c.parentLegal) + '.' : '') + '</td></tr></table>';
}
// Pictures that may be shown inside HN Mail itself (signatures, drafts): HN Group's own sites and Google's image hosts.
function allowedImage(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
    return ['staff.hngroup.org.uk', 'hngroup.org.uk', 'www.hngroup.org.uk', 'branding.hngroup.org.uk', 'network.hngroup.org.uk'].includes(u.hostname) || /^[a-z0-9-]+\.googleusercontent\.com$/.test(u.hostname);
  } catch { return false; }
}
module.exports = { hnSignature, allowedImage };
