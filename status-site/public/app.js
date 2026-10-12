'use strict';
const $ = s => document.querySelector(s);
const labels = { operational: 'Operational', degraded: 'Degraded performance', outage: 'Major outage', maintenance: 'Under maintenance', unknown: 'Awaiting checks' };
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const date = value => new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
let key = '', adminData;
async function api(route, data) {
  const response = await fetch(route, { headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }, ...(data ? { method: 'POST', body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(15000), cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to load status');
  return result;
}
async function refresh() {
  try {
    const data = await api('/api/status');
    const active = data.incidents.filter(i => i.status !== 'resolved');
    const overall = ['outage', 'degraded', 'maintenance', 'unknown'].find(state => data.services.some(s => s.status === state)) || 'operational';
    $('#summary').className = `summary ${overall}`;
    $('#summary').textContent = !data.services.length ? 'No services published yet' : active.length ? `${active.length} active notice${active.length > 1 ? 's' : ''} · ${labels[overall]}` : overall === 'operational' ? 'All systems operational' : labels[overall];
    $('#checked').textContent = `Page refreshed ${new Date().toLocaleTimeString('en-GB')}`;
    $('#services').innerHTML = data.services.map(s => {
      const bars = Array.from({ length: 30 }, (_, n) => {
        const day = new Date(Date.now() - (29 - n) * 86400000).toISOString().slice(0, 10), d = s.days[day];
        const state = !d ? 'unknown' : d.ok === d.total ? 'operational' : d.ok === 0 ? 'outage' : 'degraded';
        return `<span class="bar ${state}" title="${day}: ${d ? (100 * d.ok / d.total).toFixed(2) + '% successful checks' : 'No data'}"></span>`;
      }).join('');
      return `<article class="card service"><div class="service-top"><h3>${escapeHTML(s.name)}</h3><span class="badge ${s.status}">${labels[s.status]}</span></div><div class="history" role="img" aria-label="30-day availability history for ${escapeHTML(s.name)}">${bars}</div><div class="service-meta"><span>${s.uptime === null ? 'No checks recorded' : s.uptime.toFixed(2) + '% successful checks · last 30 days'}</span><span>${s.lastChecked ? 'Last check: ' + escapeHTML(date(s.lastChecked)) : 'Waiting for first check'}</span></div></article>`;
    }).join('') || '<div class="card">Services will appear here once they are added.</div>';
    $('#incidents').innerHTML = data.incidents.map(i => `<article class="card incident"><span class="eyebrow">${escapeHTML(i.status)} · ${escapeHTML(date(i.createdAt))}</span><h3>${escapeHTML(i.title)}</h3><p class="muted">${i.serviceIds.map(id => escapeHTML(data.services.find(s => s.id === id)?.name || 'Removed service')).join(' · ') || 'General notice'}</p>${i.updates.map(u => `<div class="update"><strong>${escapeHTML(u.status)}</strong><time>${escapeHTML(date(u.at))}</time><p>${escapeHTML(u.message)}</p></div>`).join('')}</article>`).join('') || '<div class="card empty"><span class="empty-symbol">✓</span><h3>No incidents to report</h3><p>Service updates will be published here.</p></div>';
  } catch { $('#summary').className = 'summary unknown'; $('#summary').textContent = 'Live status unavailable. Displayed information may be out of date. Retrying shortly.'; }
}
async function loadAdmin() {
  adminData = await api('/api/admin');
  $('#login').hidden = true; $('#dashboard').hidden = false;
  $('#admin-services').innerHTML = adminData.services.map(s => `<div class="card service-top"><strong>${escapeHTML(s.name)}</strong><div><button data-edit="${s.id}" class="secondary">Edit</button> <button data-delete="${s.id}" class="secondary">Delete</button></div></div>`).join('');
  $('#incident-picker').innerHTML = '<option value="">New incident</option>' + adminData.incidents.map(i => `<option value="${i.id}">${escapeHTML(i.title)} (${escapeHTML(i.status)})</option>`).join('');
  $('#affected').innerHTML = adminData.services.map(s => `<label class="check"><input type="checkbox" name="serviceIds" value="${s.id}"> ${escapeHTML(s.name)}</label>`).join('');
}
function feedback(error) { $('#message').textContent = error.message || error; }
if (!document.body.dataset.admin) { refresh(); setInterval(refresh, 30000); }
else {
  $('#login').addEventListener('submit', async e => { e.preventDefault(); key = $('#key').value.trim(); try { await loadAdmin(); $('#key').value = ''; feedback('Dashboard unlocked.'); } catch (e) { key = ''; feedback(e); } });
  $('#logout').onclick = () => { key = ''; adminData = null; $('#dashboard').hidden = true; $('#login').hidden = false; feedback('Dashboard locked.'); };
  $('#cancel-service').onclick = () => { $('#service-form').reset(); $('#service-heading').textContent = 'Add service'; };
  $('#admin-services').onclick = async e => {
    const edit = e.target.dataset.edit, remove = e.target.dataset.delete;
    if (edit) { const s = adminData.services.find(s => s.id === edit); for (const name of ['id', 'name', 'url', 'override']) $('#service-form').elements[name].value = s[name]; $('#service-heading').textContent = 'Edit service'; $('#service-form').scrollIntoView({ behavior: 'smooth' }); }
    if (remove && confirm('Delete this service and its check history?')) try { await api('/api/admin/delete-service', { id: remove }); await loadAdmin(); feedback('Service deleted.'); } catch (e) { feedback(e); }
  };
  $('#incident-picker').onchange = () => { const i = adminData.incidents.find(i => i.id === $('#incident-picker').value); const f = $('#incident-form'); f.elements.title.value = i?.title || ''; f.elements.status.value = i?.status || 'investigating'; f.elements.message.value = ''; f.querySelectorAll('[name="serviceIds"]').forEach(c => { c.checked = i?.serviceIds.includes(c.value) || false; }); };
  for (const [selector, route] of [['#service-form', 'service'], ['#incident-form', 'incident']]) $(selector).addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target, button = f.querySelector('button[type="submit"],button:not([type])'); button.disabled = true;
    try { const data = Object.fromEntries(new FormData(f)); if (route === 'incident') data.serviceIds = new FormData(f).getAll('serviceIds'); await api('/api/admin/' + route, data); f.reset(); await loadAdmin(); $('#service-heading').textContent = 'Add service'; feedback('Saved successfully.'); } catch (e) { feedback(e); } finally { button.disabled = false; }
  });
}
