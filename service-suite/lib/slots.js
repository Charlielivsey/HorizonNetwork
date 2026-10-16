'use strict';
// Appointment availability in UK time (Europe/London, including BST/GMT changes).
const { fail, json } = require('./http');
const CLOSED = ['cancelled', 'rejected', 'declined'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function offsetMinutes(at) {
  const part = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'shortOffset' }).formatToParts(at).find(p => p.type === 'timeZoneName').value;
  const m = part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
}
// UK wall-clock date/time → UTC milliseconds.
function londonToUtc(date, time) {
  const [y, mo, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let utc = guess - offsetMinutes(new Date(guess)) * 60000;
  utc = guess - offsetMinutes(new Date(utc)) * 60000;
  return utc;
}
const toMinutes = t => { const [h, m] = String(t || '').split(':').map(Number); return h * 60 + m; };
const pad = n => String(n).padStart(2, '0');
const todayLondon = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

function available(store, typeModule, bookingModule, type, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw fail(400, 'Choose a valid date.');
  const f = type.fields;
  const duration = Number(f.duration) || 30;
  const weekday = DAYS[new Date(date + 'T12:00:00Z').getUTCDay()];
  if (!(f.days || []).includes(weekday)) return [];
  const horizon = Number(f.horizon) || 30, lead = Number(f.lead) || 0;
  const today = todayLondon();
  const last = new Date(Date.parse(today + 'T12:00:00Z') + horizon * 86400000).toISOString().slice(0, 10);
  if (date < today || date > last) return [];
  const earliest = Date.now() + lead * 3600000;
  const taken = new Set(store.list(bookingModule).filter(b => b.parentId === type.id && b.fields.date === date && !CLOSED.includes(b.status)).map(b => b.fields.time));
  const slots = [];
  for (let t = toMinutes(f.start || '09:00'); t + duration <= toMinutes(f.end || '17:00'); t += duration) {
    const time = pad(Math.floor(t / 60)) + ':' + pad(t % 60);
    if (londonToUtc(date, time) < earliest || taken.has(time)) continue;
    slots.push(time);
  }
  return slots;
}

function check(ctx, m, parentId, values) {
  const type = ctx.store.list(m.parent.module).find(t => t.id === parentId);
  if (!type) throw fail(400, 'Choose an appointment type.');
  if (!available(ctx.store, m.parent.module, m.key, type, values.date).includes(values.time)) throw fail(400, 'That time is no longer available. Please choose another.');
}

function route(ctx, m, parts) {
  const typeModule = ctx.config.modules.find(x => x.key === m.parent.module);
  const type = ctx.store.list(typeModule.key).find(t => t.id === parts[0]);
  if (!type || !type.published) throw fail(404, 'Appointment type not found.');
  const date = new URL(ctx.req.url, 'http://x').searchParams.get('date') || todayLondon();
  return json(ctx.res, 200, { date, today: todayLondon(), slots: available(ctx.store, typeModule.key, m.key, type, date), duration: Number(type.fields.duration) || 30 });
}
module.exports = { route, check, available, londonToUtc };
