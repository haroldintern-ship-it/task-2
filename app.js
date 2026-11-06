const list = document.querySelector('#internship-list');
const searchInput = document.querySelector('#search');
const domainFilter = document.querySelector('#domain-filter');
const modeFilter = document.querySelector('#mode-filter');
const statusPanel = document.querySelector('#status-panel');
const resultCount = document.querySelector('#results-count');
const dialog = document.querySelector('#details-dialog');
const details = document.querySelector('#dialog-content');
const form = document.querySelector('#application-form');
let internships = [];
let lastFocused = null;
let searchTimer;
let listController;

async function api(path, options) {
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || 'Something went wrong. Please try again.');
  return payload.data;
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function showStatus(message, action = false) {
  statusPanel.hidden = false;
  statusPanel.innerHTML = `<span>${escapeHtml(message)}</span>${action ? '<button id="retry-button" type="button">Try again <span aria-hidden="true">↻</span></button>' : ''}`;
  if (action) document.querySelector('#retry-button').addEventListener('click', loadInternships);
}
function hideStatus() { statusPanel.hidden = true; statusPanel.replaceChildren(); }
function renderCard(item, index) {
  return `<article class="internship-card"><div class="card-top"><span class="card-index">0${index + 1}</span><span class="domain-tag">${escapeHtml(item.domain)}</span></div><h3>${escapeHtml(item.title)}</h3><div class="card-facts"><span><span aria-hidden="true">⌖</span> ${escapeHtml(item.location)}</span><span><span aria-hidden="true">◷</span> ${escapeHtml(item.mode)}</span></div><div class="skill-list" aria-label="Required skills">${item.skills.map(skill => `<span>${escapeHtml(skill)}</span>`).join('')}</div><div class="card-bottom"><span>${item.openings} ${item.openings === 1 ? 'opening' : 'openings'}</span><button class="details-button" type="button" data-id="${escapeHtml(item.id)}">View details <span aria-hidden="true">↗</span></button></div></article>`;
}
function renderCards(items) {
  list.setAttribute('aria-busy', 'false');
  resultCount.textContent = `${items.length} ${items.length === 1 ? 'opportunity' : 'opportunities'} to explore`;
  list.innerHTML = items.map(renderCard).join('');
  list.querySelectorAll('.details-button').forEach(button => button.addEventListener('click', () => openDetails(button.dataset.id)));
  if (!items.length) showStatus('No internships match those filters. Try another search or clear your filters.');
  else hideStatus();
}
async function loadInternships() {
  listController?.abort();
  listController = new AbortController();
  list.setAttribute('aria-busy', 'true'); list.innerHTML = '<div class="loading-card"><span class="loader" aria-hidden="true"></span><span>Finding opportunities…</span></div>'; hideStatus(); resultCount.textContent = 'Loading opportunities…';
  const params = new URLSearchParams();
  if (searchInput.value.trim()) params.set('search', searchInput.value.trim());
  if (domainFilter.value) params.set('domain', domainFilter.value);
  if (modeFilter.value) params.set('mode', modeFilter.value);
  try { const items = await api(`/api/internships?${params}`, {signal:listController.signal}); renderCards(items); }
  catch (error) {
    if (error.name === 'AbortError') return;
    list.innerHTML = ''; list.setAttribute('aria-busy', 'false'); resultCount.textContent = 'Opportunities unavailable'; showStatus('We couldn’t load the internship list right now.', true);
  }
}
async function openDetails(id) {
  lastFocused = document.activeElement;
  try {
    const item = await api(`/api/internships/${encodeURIComponent(id)}`);
    details.innerHTML = `<span class="domain-tag">${escapeHtml(item.domain)}</span><h2 id="dialog-title">${escapeHtml(item.title)}</h2><div class="dialog-facts"><span>⌖ ${escapeHtml(item.location)}</span><span>◷ ${escapeHtml(item.mode)}</span><span>${item.openings} ${item.openings === 1 ? 'opening' : 'openings'}</span></div><h3>Skills you’ll bring</h3><div class="skill-list">${item.skills.map(skill => `<span>${escapeHtml(skill)}</span>`).join('')}</div><p class="dialog-id">Opportunity reference · ${escapeHtml(item.id)}</p>`;
    form.elements.internshipId.value = item.id; form.reset(); form.elements.internshipId.value = item.id; document.querySelector('#form-message').textContent = '';
    dialog.showModal(); document.querySelector('.dialog-close').focus();
  } catch { showStatus('We couldn’t load those details. Please try again.', true); }
}
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadInternships, 220);
});
document.querySelector('#search-form').addEventListener('submit', event => { event.preventDefault(); clearTimeout(searchTimer); loadInternships(); });
domainFilter.addEventListener('change', () => { clearTimeout(searchTimer); loadInternships(); });
modeFilter.addEventListener('change', () => { clearTimeout(searchTimer); loadInternships(); });
document.querySelector('#clear-filters').addEventListener('click', () => { clearTimeout(searchTimer); searchInput.value = ''; domainFilter.value = ''; modeFilter.value = ''; loadInternships(); searchInput.focus(); });
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
dialog.addEventListener('close', () => { form.reset(); document.querySelector('#form-message').textContent = ''; lastFocused?.focus(); });
form.addEventListener('submit', async event => {
  event.preventDefault();
  const message = document.querySelector('#form-message');
  if (!form.reportValidity()) { message.textContent = 'Please check the highlighted fields.'; message.className = 'form-message error'; return; }
  const portfolio = form.elements.portfolio.value.trim();
  if (portfolio && !/^https?:\/\//i.test(portfolio)) { message.textContent = 'Use a link beginning with https:// or http://.'; message.className = 'form-message error'; form.elements.portfolio.focus(); return; }
  const submit = form.querySelector('[type="submit"]'); submit.disabled = true; submit.textContent = 'Sending…'; message.textContent = '';
  try {
    await api('/api/applications', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name:form.elements.name.value, email:form.elements.email.value, portfolio, internshipId:form.elements.internshipId.value }) });
    const internshipId = form.elements.internshipId.value;
    message.textContent = 'Application received. Thanks for taking this step!'; message.className = 'form-message success'; form.reset(); form.elements.internshipId.value = internshipId;
  } catch (error) { message.textContent = error.message; message.className = 'form-message error'; }
  finally { submit.disabled = false; submit.innerHTML = 'Submit application <span aria-hidden="true">→</span>'; }
});
document.querySelector('.menu-toggle').addEventListener('click', event => {
  const button = event.currentTarget, expanded = button.getAttribute('aria-expanded') === 'true';
  button.setAttribute('aria-expanded', String(!expanded)); button.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation'); document.querySelector('#primary-nav').classList.toggle('is-open', !expanded);
});
document.querySelectorAll('#primary-nav a').forEach(link => link.addEventListener('click', () => { document.querySelector('.menu-toggle').setAttribute('aria-expanded','false'); document.querySelector('#primary-nav').classList.remove('is-open'); }));
document.querySelector('#year').textContent = new Date().getFullYear();
async function initialise() {
  try {
    internships = await api('/api/internships');
    [...new Set(internships.map(item => item.domain))].sort().forEach(domain => domainFilter.add(new Option(domain, domain)));
    [...new Set(internships.map(item => item.mode))].sort().forEach(mode => modeFilter.add(new Option(mode, mode)));
    await loadInternships();
  } catch { list.setAttribute('aria-busy','false'); list.innerHTML = ''; resultCount.textContent = 'Opportunities unavailable'; showStatus('We couldn’t connect to the internship board.', true); }
}
initialise();
