(() => {
  'use strict';

  const state = { scope: 'all-public', status: '', relationship: '', evidence: '', query: '' };
  const validScopes = new Set(['all-public', 'upstream-only', 'selected-community']);
  const elements = {
    scoreboard: document.querySelector('#scoreboard'), ledger: document.querySelector('#contribution-ledger'),
    visibleCount: document.querySelector('#visible-count'), empty: document.querySelector('#empty-ledger'),
    snapshot: document.querySelector('#snapshot'), scopeTabs: document.querySelector('#scope-tabs'),
    status: document.querySelector('#status-filter'), relationship: document.querySelector('#relationship-filter'),
    evidence: document.querySelector('#evidence-filter'), query: document.querySelector('#query-filter'),
    clear: document.querySelector('#clear-filters'),
  };
  let contributions = [];

  const escapeHtml = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const label = (value) => value.replaceAll('_', ' ');

  function readUrl() {
    const params = new URLSearchParams(location.search);
    state.scope = validScopes.has(params.get('scope')) ? params.get('scope') : 'all-public';
    state.status = params.get('status') || '';
    state.relationship = params.get('relationship') || '';
    state.evidence = params.get('evidence') || '';
    state.query = params.get('q') || '';
  }

  function writeUrl() {
    const params = new URLSearchParams();
    if (state.scope !== 'all-public') params.set('scope', state.scope);
    if (state.status) params.set('status', state.status);
    if (state.relationship) params.set('relationship', state.relationship);
    if (state.evidence) params.set('evidence', state.evidence);
    if (state.query) params.set('q', state.query);
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
  }

  function filtered() {
    const query = state.query.trim().toLowerCase();
    return contributions.filter((item) => {
      if (state.scope === 'upstream-only' && item.relationship !== 'canonical_upstream') return false;
      if (state.scope === 'selected-community' && !item.selectedCommunity) return false;
      if (state.status && item.status !== state.status) return false;
      if (state.relationship && item.relationship !== state.relationship) return false;
      if (state.evidence === 'verified' && !item.impactReceipt) return false;
      if (state.evidence === 'facts-only' && item.impactReceipt) return false;
      return !query || `${item.repository} ${item.title}`.toLowerCase().includes(query);
    });
  }

  function render() {
    const items = filtered();
    const counts = Object.fromEntries(['merged', 'open', 'draft', 'closed'].map((status) => [status, items.filter((item) => item.status === status).length]));
    const verified = items.filter((item) => item.impactReceipt).length;
    elements.scoreboard.innerHTML = [
      ['total PRs', items.length], ['merged', counts.merged], ['open', counts.open], ['draft', counts.draft],
      ['closed', counts.closed], ['verified impact', verified],
    ].map(([name, value]) => `<article><strong>${value}</strong><span>${name}</span></article>`).join('');
    elements.visibleCount.textContent = `${items.length} linked pull request${items.length === 1 ? '' : 's'}`;
    elements.ledger.innerHTML = items.map((item) => {
      const receipt = item.impactReceipt ? `<div class="impact-receipt"><strong>verified impact receipt</strong><p>${escapeHtml(item.impactReceipt.summary)}</p><a href="${escapeHtml(item.impactReceipt.evidenceUrl)}" target="_blank" rel="noreferrer">outcome evidence ↗</a></div>` : '<p class="facts-only">GitHub facts only · no verified impact claim</p>';
      return `<article class="contribution-card">
        <div class="contribution-card__meta"><span class="status status--${item.status}">${item.status}</span><span>${label(item.relationship)}</span><span>${escapeHtml(item.community || 'unscoped')}</span></div>
        <h3><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.repository)} #${item.number} ↗</a></h3>
        <p>${escapeHtml(item.title)}</p>${receipt}
      </article>`;
    }).join('');
    elements.empty.hidden = items.length > 0;
    elements.scopeTabs.querySelectorAll('button').forEach((button) => {
      const active = button.dataset.scope === state.scope;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    elements.status.value = state.status;
    elements.relationship.value = state.relationship;
    elements.evidence.value = state.evidence;
    if (document.activeElement !== elements.query) elements.query.value = state.query;
  }

  function update(key, value) { state[key] = value; writeUrl(); render(); }

  async function init() {
    readUrl();
    const response = await fetch('./data/contributions.json');
    if (!response.ok) throw new Error(`ledger request failed: ${response.status}`);
    const payload = await response.json();
    contributions = payload.contributions;
    elements.snapshot.textContent = `snapshot ${payload.generatedAt.slice(0, 10)} · ${contributions.length} public PR facts · ${contributions.filter((item) => item.impactReceipt).length} verified impact receipts`;
    render();
  }

  elements.scopeTabs.addEventListener('click', (event) => { const scope = event.target.closest('[data-scope]')?.dataset.scope; if (scope) update('scope', scope); });
  elements.status.addEventListener('change', () => update('status', elements.status.value));
  elements.relationship.addEventListener('change', () => update('relationship', elements.relationship.value));
  elements.evidence.addEventListener('change', () => update('evidence', elements.evidence.value));
  elements.query.addEventListener('input', () => update('query', elements.query.value));
  elements.clear.addEventListener('click', () => { Object.assign(state, { scope: 'all-public', status: '', relationship: '', evidence: '', query: '' }); writeUrl(); render(); });
  addEventListener('popstate', () => { readUrl(); render(); });
  init().catch((error) => { elements.snapshot.textContent = `Unable to load contribution ledger: ${error.message}`; });
})();
