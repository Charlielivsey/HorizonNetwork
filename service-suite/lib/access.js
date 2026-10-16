'use strict';
// Who is asking: anonymous visitor, site account (customer/community/member), staff (HN Group Auth)
// or administrator (system owner / Super Admin, as reported live by Auth). Server-side only.
const { fail } = require('./http');

const isManager = (ctx, m) => !!ctx.staff && (m.manage === 'staff' ? true : ctx.admin);
function meets(ctx, level) {
  switch (level) {
    case 'public': return true;
    case 'account': return !!ctx.account || !!ctx.staff;
    case 'members': return !!ctx.account?.member || !!ctx.staff;
    case 'staff': return !!ctx.staff;
    case 'admin': return !!ctx.staff && ctx.admin;
    case 'manager': return false;
    default: return false;
  }
}
function requireStaff(ctx) { if (!ctx.staff) throw fail(401, 'Sign in with HN Group Auth to continue.'); }
function requireAdmin(ctx) { requireStaff(ctx); if (!ctx.admin) throw fail(403, 'Only the system owner and Super Admin members can do this.'); }
function actor(ctx) {
  if (ctx.staff) return { type: 'staff', id: String(ctx.staff.id || ctx.staff.email), name: ctx.staff.displayName || 'Staff member' };
  if (ctx.account) return { type: 'account', id: ctx.account.id, name: ctx.account.name };
  return { type: 'public', id: '', name: 'Visitor' };
}
const sameActor = (a, b) => !!a && !!b && a.type === b.type && !!a.id && a.id === b.id;
function sameOrigin(ctx) {
  if (ctx.req.headers.origin !== 'https://' + ctx.config.domain) throw fail(403, 'Request origin not allowed.');
}
module.exports = { isManager, meets, requireStaff, requireAdmin, actor, sameActor, sameOrigin };
