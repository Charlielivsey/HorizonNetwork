'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const labels = { operational: 'Operational', degraded: 'Degraded performance', outage: 'Major outage', maintenance: 'Under maintenance', unknown: 'Awaiting checks' };
const stages = { investigating: 'Investigating', identified: 'Identified', monitoring: 'Monitoring', resolved: 'Resolved', scheduled: 'Scheduled maintenance' };
const paths = {
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>', check: '<path d="m5 12 4 4L19 6"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  message: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>', shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  logout: '<path d="M9 4H4v16h5m5-12 4 4-4 4m-7-4h13"/>', search: '<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>', send: '<path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>', edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3Zm-2 2 5 5"/>',
  alert: '<path d="m12 3 10 18H2L12 3ZM12 9v5m0 3h.01"/>', server: '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.activity}</svg>`;
$$('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const date = value => new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const motion = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function reveal(container) {
  if (!motion()) return;
  [...container.children].slice(0, 12).forEach((el, i) => el.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 380, delay: i * 35, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
}
function render(container, html, animate = false) {
  if (container.renderedHTML === html) return;
  container.renderedHTML = html;
  container.innerHTML = html;
  if (animate) reveal(container);
}
function badge(status, stage = false) {
  const known = stage ? stages : labels;
  return `<span class="badge ${Object.hasOwn(known, status) ? status : 'unknown'}">${escapeHTML(known[status] || 'Unknown')}</span>`;
}
let adminData, publicData, incidentFilter = 'all', deleteId, adminView = 'overview';
async function api(route, data) {
  const response = await fetch(route, { headers: { 'Content-Type': 'application/json' }, ...(data ? { method: 'POST', body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(15000), cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || 'Unable to load status'), { status: response.status });
  return result;
}
function setText(selector, text) { $(selector).textContent = text; }
function serviceState(s) { return Object.hasOwn(labels, s.status) ? s.status : 'unknown'; }
function renderIncidents(animate = false) {
  const incidents = publicData.incidents.filter(i => incidentFilter === 'all' || (incidentFilter === 'resolved' ? i.status === 'resolved' : i.status !== 'resolved'));
  const html = incidents.map(i => `<article class="card incident"><div class="incident-top">${badge(i.status, true)}<time datetime="${escapeHTML(i.createdAt)}">${escapeHTML(date(i.createdAt))}</time></div><h3>${escapeHTML(i.title)}</h3><p class="incident-services">${icon('layers')}${i.serviceIds.map(id => escapeHTML(publicData.services.find(s => s.id === id)?.name || 'Removed service')).join(' · ') || 'General notice'}</p><div class="update"><div><strong>${escapeHTML(stages[i.updates[0]?.status] || i.status)}</strong><time>${escapeHTML(date(i.updates[0]?.at || i.createdAt))}</time></div><p>${escapeHTML(i.updates[0]?.message || '')}</p></div>${i.updates.length > 1 ? `<details class="previous-updates"><summary>${i.updates.length - 1} earlier update${i.updates.length > 2 ? 's' : ''}</summary>${i.updates.slice(1).map(u => `<div class="update"><div><strong>${escapeHTML(stages[u.status] || u.status)}</strong><time>${escapeHTML(date(u.at))}</time></div><p>${escapeHTML(u.message)}</p></div>`).join('')}</details>` : ''}</article>`).join('');
  render($('#incidents'), html || `<div class="card empty"><span class="empty-symbol">${icon('check')}</span><h3>${incidentFilter === 'resolved' ? 'No resolved incidents yet' : incidentFilter === 'active' ? 'No active notices' : 'Nothing to report. That’s a good thing.'}</h3><p>${incidentFilter === 'all' ? 'When there’s something you need to know, you’ll find it here.' : 'Incident updates will appear here when available.'}</p></div>`, animate);
  $('#incidents').setAttribute('aria-busy', 'false');
}
async function refresh() {
  try {
    const data = await api('/api/status'), first = !publicData;
    publicData = data;
    const active = data.incidents.filter(i => i.status !== 'resolved');
    const overall = data.services.length ? ['outage', 'degraded', 'maintenance', 'unknown'].find(state => data.services.some(s => s.status === state)) || 'operational' : 'unknown';
    $('#summary').className = `health-hero ${overall}`;
    const title = !data.services.length ? 'No services published yet' : overall === 'operational' ? (active.length ? 'Services are operational' : 'All systems operational') : labels[overall];
    setText('#summary-title', title);
    setText('#summary-description', active.length ? `${active.length} active notice${active.length > 1 ? 's' : ''}. See incident updates below for the latest information.` : overall === 'operational' ? 'Everything is running as expected. We’re keeping an eye on it.' : overall === 'unknown' ? 'We’re waiting for fresh checks. Availability will appear here shortly.' : 'Some services need attention. Find individual status and updates below.');
    $('#summary-icon').innerHTML = icon(overall === 'operational' ? 'check' : overall === 'outage' || overall === 'degraded' ? 'alert' : 'activity');
    setText('#hero-health-label', active.length ? 'Incident updates available below' : overall === 'operational' ? 'No active incidents' : 'Monitoring your services');
    setText('#checked', `Refreshed ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · Checks every minute`);
    $('#connection').className = 'live-label connected'; $('#connection').innerHTML = '<i></i>Live status';
    setText('#count-services', data.services.length); setText('#count-healthy', data.services.filter(s => s.status === 'operational').length); setText('#count-incidents', active.length);
    const html = data.services.map(s => {
      const state = serviceState(s);
      const bars = Array.from({ length: 30 }, (_, n) => {
        const day = new Date(Date.now() - (29 - n) * 86400000).toISOString().slice(0, 10), d = s.days[day];
        const health = !d ? 'unknown' : d.ok === d.total ? 'operational' : d.ok === 0 ? 'outage' : 'degraded';
        const tip = `${day} · ${d ? (100 * d.ok / d.total).toFixed(2) + '% successful checks' : 'No data'}`;
        return `<button type="button" class="bar ${health}" aria-label="${tip}" data-tip="${tip}"></button>`;
      }).join('');
      return `<article class="service"><div class="service-top"><div class="service-identity"><span class="service-icon">${icon('server')}</span><div><h3>${escapeHTML(s.name)}</h3><p>${s.lastChecked ? 'Checked ' + escapeHTML(date(s.lastChecked)) : 'Waiting for the first check'}</p></div></div>${badge(state)}</div><div class="service-history"><div class="history" aria-label="30-day availability for ${escapeHTML(s.name)}">${bars}</div><div class="uptime-number"><strong>${s.uptime === null ? '—' : s.uptime.toFixed(2) + '<small>%</small>'}</strong><span>check uptime</span></div></div></article>`;
    }).join('');
    render($('#services'), html || '<div class="empty"><span class="empty-symbol">' + icon('layers') + '</span><h3>Services are on their way</h3><p>Monitored services will appear here once they’re added.</p></div>', first);
    $('#services').setAttribute('aria-busy', 'false'); renderIncidents(first);
  } catch {
    $('#summary').className = 'health-hero unknown'; setText('#summary-title', 'Live status unavailable'); setText('#summary-description', 'Displayed information may be out of date. We’ll try again shortly.');
    $('#connection').className = 'live-label'; $('#connection').innerHTML = '<i></i>Reconnecting'; setText('#hero-health-label', 'Waiting for a connection');
    $('#summary-icon').innerHTML = icon('alert');
    $('#services').setAttribute('aria-busy', 'false'); $('#incidents').setAttribute('aria-busy', 'false');
    if (!publicData) { $('#services').innerHTML = '<div class="empty"><h3>We couldn’t load service health</h3><p>Retrying automatically. Please check back shortly.</p></div>'; $('#incidents').innerHTML = '<div class="card empty"><h3>Updates are temporarily unavailable</h3><p>No incident information has been loaded yet.</p></div>'; }
  }
}
function showView(view) {
  if (!['overview', 'services', 'incidents'].includes(view)) return;
  adminView = view;
  const titles = { overview: ['Overview', 'The health of your services, all in one place.'], services: ['Services', 'Keep your services visible and their status accurate.'], incidents: ['Incident updates', 'Keep everyone informed, from first report to resolution.'] };
  $('#admin-page-title').innerHTML = titles[view][0] + '<span class="accent">.</span>'; setText('#admin-page-description', titles[view][1]);
  $$('[data-panel]').forEach(el => { el.hidden = el.dataset.panel !== view; });
  $$('.admin-nav [data-view]').forEach(el => { el.classList.toggle('selected', el.dataset.view === view); if (el.dataset.view === view) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
  const panel = $(`[data-panel="${view}"]`); reveal(panel);
}
function renderServices() {
  const query = $('#service-search').value.toLowerCase().trim();
  const services = adminData.services.filter(s => s.name.toLowerCase().includes(query));
  setText('#managed-count', `${services.length} service${services.length === 1 ? '' : 's'}`);
  render($('#admin-services'), services.map(s => {
    const health = publicData.services.find(p => p.id === s.id)?.status || 'unknown';
    return `<article class="managed-service"><span class="service-icon">${icon('server')}</span><div class="managed-info"><h3>${escapeHTML(s.name)}</h3><p>${s.override === 'auto' ? 'Automatic checks' : 'Manual override'}${s.url ? ' · ' + escapeHTML(s.url) : ''}</p></div>${badge(health)}<div class="row-actions"><button class="icon-button" data-edit="${escapeHTML(s.id)}" aria-label="Edit ${escapeHTML(s.name)}">${icon('edit')}</button><button class="icon-button delete-action" data-delete="${escapeHTML(s.id)}" aria-label="Delete ${escapeHTML(s.name)}">${icon('trash')}</button></div></article>`;
  }).join('') || `<div class="empty"><span class="empty-symbol">${icon(query ? 'search' : 'layers')}</span><h3>${query ? 'No matching services' : 'Start with your first service'}</h3><p>${query ? 'Try a different name.' : 'Add a service to start monitoring its availability.'}</p></div>`);
}
function preview() {
  const f = $('#incident-form');
  setText('#preview-title', f.elements.title.value.trim() || 'Your incident title'); setText('#preview-message', f.elements.message.value.trim() || 'Your update will appear here as you write.');
  const stage = f.elements.status.value;
  $('#preview-stage').className = `badge ${stage}`; setText('#preview-stage', stages[stage]); setText('#preview-status', stages[stage]);
  const ids = new FormData(f).getAll('serviceIds');
  setText('#preview-services', adminData.services.filter(s => ids.includes(s.id)).map(s => s.name).join(' · ') || 'General notice');
}
async function loadAdmin() {
  const selectedIncident = $('#incident-picker').value;
  const affected = new FormData($('#incident-form')).getAll('serviceIds');
  [adminData, publicData] = await Promise.all([api('/api/admin'), api('/api/status')]);
  const first = $('#dashboard').hidden;
  $('#admin-loading').hidden = true; $('#sign-in-again').hidden = true; $('#dashboard').hidden = false;
  setText('#admin-count-services', adminData.services.length); setText('#nav-service-count', adminData.services.length);
  setText('#admin-count-healthy', publicData.services.filter(s => s.status === 'operational').length); setText('#admin-count-incidents', adminData.incidents.filter(i => i.status !== 'resolved').length);
  render($('#overview-services'), adminData.services.map(s => `<div class="snapshot-row"><span class="service-icon">${icon('server')}</span><div><strong>${escapeHTML(s.name)}</strong><span>${s.override === 'auto' ? 'Automatic checks' : 'Manual override'}</span></div>${badge(publicData.services.find(p => p.id === s.id)?.status || 'unknown')}</div>`).join('') || '<div class="small-empty">No services yet. Add your first service to begin.</div>');
  render($('#overview-incidents'), adminData.incidents.slice(0, 3).map(i => `<button type="button" class="notice-row" data-incident="${escapeHTML(i.id)}">${badge(i.status, true)}<strong>${escapeHTML(i.title)}</strong><time>${escapeHTML(date(i.updates[0]?.at || i.createdAt))}</time></button>`).join('') || `<div class="small-empty">${icon('check')}<strong>No incidents to report</strong><p>Your next update starts here.</p></div>`);
  renderServices();
  $('#incident-picker').innerHTML = '<option value="">Create a new incident</option>' + adminData.incidents.map(i => `<option value="${escapeHTML(i.id)}">${escapeHTML(i.title)} (${escapeHTML(stages[i.status] || i.status)})</option>`).join('');
  if (adminData.incidents.some(i => i.id === selectedIncident)) $('#incident-picker').value = selectedIncident;
  $('#affected').innerHTML = adminData.services.map(s => `<label class="check"><input type="checkbox" name="serviceIds" value="${escapeHTML(s.id)}"${affected.includes(s.id) ? ' checked' : ''}>${escapeHTML(s.name)}</label>`).join('') || '<p class="muted">No services added yet. You can still publish a general notice.</p>';
  preview(); if (first) reveal($(`[data-panel="${adminView}"]`));
}
let messageTimer;
function feedback(error) {
  const message = $('#message'); clearTimeout(messageTimer);
  message.hidden = false; message.textContent = error.message || error; message.className = error instanceof Error ? 'toast error' : 'toast success';
  if (motion()) message.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 250 });
  if ([401, 403, 503].includes(error.status)) { $('#dashboard').hidden = true; $('#sign-in-again').hidden = false; $('#admin-loading').hidden = true; adminData = null; $$('dialog[open]').forEach(d => d.close()); }
  else if (error instanceof Error && !adminData) { $('#admin-loading').hidden = true; $('#sign-in-again').hidden = false; }
  else if (!(error instanceof Error)) messageTimer = setTimeout(() => { message.hidden = true; }, 5000);
}
function busy(button, value, label = 'Saving…') {
  if (value) { button.dataset.original = button.innerHTML; button.disabled = true; button.innerHTML = '<span class="spinner"></span>' + label; }
  else { button.disabled = false; button.innerHTML = button.dataset.original; }
}
function openService(id) {
  const f = $('#service-form'); f.reset(); $('#service-error').hidden = true;
  const service = adminData.services.find(s => s.id === id);
  if (service) for (const name of ['id', 'name', 'url', 'override']) f.elements[name].value = service[name];
  setText('#service-heading', service ? 'Edit service' : 'Add service'); f.elements.url.required = f.elements.override.value === 'auto'; $('#service-dialog').showModal();
}
function selectIncident(id) {
  const f = $('#incident-form'), incident = adminData.incidents.find(i => i.id === id);
  f.elements.id.value = incident?.id || ''; f.elements.title.value = incident?.title || ''; f.elements.status.value = incident?.status || 'investigating'; f.elements.message.value = '';
  f.querySelectorAll('[name="serviceIds"]').forEach(c => { c.checked = incident?.serviceIds.includes(c.value) || false; }); preview();
}
if (document.body.dataset.denied) {
  const reason = new URLSearchParams(window.location.search).get('reason');
  if (reason === 'unavailable') { setText('#denied-title', 'Sign-in temporarily unavailable'); setText('#denied-message', 'The staff portal could not verify your access. Please try again shortly or contact the system owner.'); }
  if (reason === 'expired') { setText('#denied-title', 'Please sign in again'); setText('#denied-message', 'Your staff sign-in or return link has expired. Start again below.'); }
} else if (!document.body.dataset.admin) {
  refresh(); setInterval(() => { if (!document.hidden) refresh(); }, 30000);
  $$('[data-filter]').forEach(button => button.onclick = () => { incidentFilter = button.dataset.filter; $$('[data-filter]').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', String(b === button)); }); if (publicData) renderIncidents(true); });
} else {
  loadAdmin().catch(feedback);
  $$('[data-view]').forEach(button => button.onclick = () => showView(button.dataset.view));
  $$('[data-close]').forEach(button => button.onclick = () => $( '#' + button.dataset.close).close());
  $$('dialog').forEach(dialog => dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } }));
  $('#refresh-admin').onclick = async () => { const b = $('#refresh-admin'); busy(b, true, ''); try { await loadAdmin(); feedback('Workspace refreshed.'); } catch(e) { feedback(e); } finally { busy(b, false); } };
  $('#logout').onclick = async () => { try { await api('/auth/logout', {}); window.location.assign('/'); } catch (e) { feedback(e); } };
  $('#service-search').oninput = renderServices; $('#add-service').onclick = () => openService();
  $('#service-form').elements.override.onchange = () => { $('#service-form').elements.url.required = $('#service-form').elements.override.value === 'auto'; };
  $('#overview-publish').onclick = () => { showView('incidents'); selectIncident(''); };
  $('#overview-incidents').onclick = e => { const row = e.target.closest('[data-incident]'); if (row) { showView('incidents'); selectIncident(row.dataset.incident); } };
  $('#admin-services').onclick = e => {
    const edit = e.target.closest('[data-edit]'), remove = e.target.closest('[data-delete]');
    if (edit) openService(edit.dataset.edit);
    if (remove) { deleteId = remove.dataset.delete; const service = adminData.services.find(s => s.id === deleteId); setText('#delete-description', `“${service.name}” and its check history will be removed. Existing incident updates will be kept. This can’t be undone.`); $('#delete-error').hidden = true; $('#delete-dialog').showModal(); }
  };
  $('#confirm-delete').onclick = async () => {
    const button = $('#confirm-delete'); busy(button, true, 'Deleting…');
    try { await api('/api/admin/delete-service', { id: deleteId }); $('#delete-dialog').close(); await loadAdmin(); feedback('Service deleted.'); }
    catch (e) { $('#delete-error').hidden = false; setText('#delete-error', e.message); if ([401,403,503].includes(e.status)) feedback(e); } finally { busy(button, false); }
  };
  $('#incident-picker').onchange = () => selectIncident($('#incident-picker').value);
  $('#incident-form').oninput = preview; $('#incident-form').onchange = preview;
  for (const [selector, route] of [['#service-form', 'service'], ['#incident-form', 'incident']]) $(selector).addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target, button = f.querySelector('button[type="submit"]'); busy(button, true, route === 'incident' ? 'Publishing…' : 'Saving…');
    try { const data = Object.fromEntries(new FormData(f)); if (route === 'incident') data.serviceIds = new FormData(f).getAll('serviceIds'); await api('/api/admin/' + route, data); f.reset(); if (route === 'service') $('#service-dialog').close(); await loadAdmin(); feedback(route === 'incident' ? 'Update published to your public status page.' : 'Service saved.'); }
    catch (e) { if (route === 'service') { $('#service-error').hidden = false; setText('#service-error', e.message); } if (route === 'incident' || [401,403,503].includes(e.status)) feedback(e); }
    finally { busy(button, false); }
  });
}
