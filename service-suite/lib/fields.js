'use strict';
// Validates submitted values against a module's field definitions. Unknown keys are dropped.
const { fail, text, email } = require('./http');
const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^([01]\d|2[0-3]):[0-5]\d$/, DATETIME = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

function validDate(value) {
  const d = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function one(field, raw, lookups = {}) {
  const label = field.label || field.name;
  const empty = raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && !raw.length);
  if (empty) {
    if (field.required && field.type !== 'checkbox') throw fail(400, label + ' is required.');
    return field.type === 'checkbox' ? false : field.type === 'multiselect' ? [] : '';
  }
  switch (field.type) {
    case 'textarea': return text(raw, field.max || 10000, field.required, label);
    case 'email': return email(raw, field.required, label);
    case 'url': {
      const value = text(raw, 500, field.required, label);
      let u; try { u = new URL(value); } catch { throw fail(400, label + ' must be a full web address starting with https://'); }
      if (!['https:', 'http:'].includes(u.protocol)) throw fail(400, label + ' must start with https:// or http://');
      return u.href;
    }
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
      if (!Number.isFinite(n)) throw fail(400, label + ' must be a number.');
      if (field.integer !== false && !Number.isInteger(n)) throw fail(400, label + ' must be a whole number.');
      if (field.min !== undefined && n < field.min) throw fail(400, `${label} must be at least ${field.min}.`);
      if (field.max !== undefined && n > field.max) throw fail(400, `${label} must be ${field.max} or less.`);
      return n;
    }
    case 'money': {
      // Entered as pounds and pence; stored as an integer number of pence.
      const value = String(raw).trim().replace(/^£/, '').replace(/,/g, '');
      if (!/^\d{1,9}(\.\d{1,2})?$/.test(value)) throw fail(400, label + ' must be an amount such as 125.50.');
      return Math.round(Number(value) * 100);
    }
    case 'date': {
      const value = text(raw, 10, field.required, label);
      if (!DATE.test(value) || !validDate(value)) throw fail(400, label + ' must be a valid date.');
      return value;
    }
    case 'time': {
      const value = text(raw, 5, field.required, label);
      if (!TIME.test(value)) throw fail(400, label + ' must be a time such as 09:30.');
      return value;
    }
    case 'datetime': {
      const value = text(raw, 16, field.required, label);
      if (!DATETIME.test(value) || !validDate(value.slice(0, 10))) throw fail(400, label + ' must be a valid date and time.');
      return value;
    }
    case 'select': {
      const value = text(String(raw), 120, field.required, label);
      if (!field.options.some(o => (o.value ?? o) === value)) throw fail(400, 'Choose a valid option for ' + label + '.');
      return value;
    }
    case 'multiselect': {
      if (!Array.isArray(raw)) throw fail(400, 'Choose valid options for ' + label + '.');
      const allowed = field.options.map(o => o.value ?? o);
      const values = [...new Set(raw.map(String))];
      if (values.some(v => !allowed.includes(v))) throw fail(400, 'Choose valid options for ' + label + '.');
      return values;
    }
    case 'checkbox': return raw === true || raw === 'true' || raw === 'on';
    case 'user': {
      const value = text(String(raw), 64, field.required, label);
      if (!(lookups.users || []).some(u => u.id === value)) throw fail(400, 'Choose a staff member who has used this website for ' + label + '.');
      return value;
    }
    case 'account': {
      const value = text(String(raw), 24, field.required, label);
      if (!(lookups.accounts || []).some(a => a.id === value && !a.disabled)) throw fail(400, 'Choose an active account for ' + label + '.');
      return value;
    }
    case 'item': {
      const value = text(String(raw), 24, field.required, label);
      if (!(lookups.items?.[field.of] || []).some(i => i.id === value)) throw fail(400, 'Choose a valid option for ' + label + '.');
      return value;
    }
    default: return text(raw, field.max || 200, field.required, label);
  }
}

function validate(fields, input, lookups, { partial = false } = {}) {
  const out = {};
  input = input && typeof input === 'object' ? input : {};
  for (const field of fields) {
    if (field.readonly) continue;
    if (partial && !(field.name in input)) continue;
    out[field.name] = one(field, input[field.name], lookups);
  }
  return out;
}
module.exports = { validate, one, validDate };
