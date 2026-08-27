(() => {
  'use strict';
  const counters = document.querySelector('#contribution-counters');
  const list = document.querySelector('#contribution-list');
  const shelf = document.querySelector('#badge-shelf');
  const limitations = document.querySelector('#contribution-limitations');
  const escapeHtml = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  let ledger;
  let scope = 'upstream';
  let evidenceIds = null;

  function render() {
    let rows = ledger.contributions;
    if (scope === 'upstream') rows = rows.filter((row) => row.relationship === 'canonical_upstream');
    if (scope === 'selected') rows = rows.filter((row) => row.community === 'pippin');
    if (evidenceIds) rows = rows.filter((row) => evidenceIds.has(row.id));
    const accepted = rows.filter((row) => row.headline && ['accepted', 'adopted'].includes(row.disposition));
    const values = [
      ['merged upstream PRs', accepted.filter((row) => row.kind === 'pull_request' && row.lifecycle === 'merged').length],
      ['adopted changes', accepted.filter((row) => row.kind === 'commit_adoption').length],
      ['accepted issues / reproductions / reviews', accepted.filter((row) => ['issue', 'reproduction', 'review'].includes(row.kind)).length],
      ['open-ready', rows.filter((row) => row.lifecycle === 'open_ready').length],
      ['communities', new Set(accepted.map((row) => row.community)).size],
    ];
    counters.innerHTML = values.map(([label, value]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join('');
    const merged = accepted.filter((row) => row.kind === 'pull_request' && row.lifecycle === 'merged').map((row) => row.id);
    const adopted = accepted.filter((row) => row.kind === 'commit_adoption').map((row) => row.id);
    const badges = [
      ['First upstream merge', '1 merged PR in a canonical upstream', merged],
      ['Adopted patch', '1 adopted change with attribution-grade public evidence', adopted],
      ['2 communities', 'accepted impact in 2 canonical upstream communities', new Set(accepted.map((row) => row.community)).size >= 2 ? accepted.map((row) => row.id) : []],
    ];
    shelf.innerHTML = badges.map(([label, condition, ids]) => `<button type="button" data-evidence-ids="${ids.join(',')}" ${ids.length ? '' : 'disabled'}><span>${ids.length ? '◆' : '◇'} ${escapeHtml(label)}</span><small>${escapeHtml(ids.length ? 'open evidence' : condition)}</small></button>`).join('');
    list.innerHTML = rows.length ? rows.map((row) => `<article class="contribution-row" id="receipt-${escapeHtml(row.id)}"><div><span class="impact impact--${escapeHtml(row.disposition)}">${escapeHtml(['accepted', 'adopted'].includes(row.disposition) ? 'accepted impact' : 'activity')}</span><span>${escapeHtml(row.relationship.replaceAll('_', ' '))}</span></div><div><h3><a href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">${escapeHtml(row.title)} ↗</a></h3><p>${escapeHtml(row.repository)} · ${escapeHtml(row.kind.replaceAll('_', ' '))} · ${escapeHtml(row.lifecycle.replaceAll('_', ' '))}</p></div><div>${row.evidence.map((item, index) => `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">evidence ${index + 1} ↗</a>`).join(' ')}</div></article>`).join('') : '<p>No public receipts in this scope.</p>';
    limitations.textContent = ledger.sourceReceipt.limitations.join(' ');
  }

  async function load() {
    const response = await fetch('./data/contributions.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`contributions: ${response.status}`);
    ledger = await response.json();
    const requested = new URLSearchParams(location.search).get('contributions');
    scope = ['upstream', 'all', 'selected'].includes(requested) ? requested : 'upstream';
    document.querySelectorAll('[data-contribution-scope]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.contributionScope === scope)));
    render();
  }
  document.querySelector('.scope-tabs')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-contribution-scope]');
    if (!button || !ledger) return;
    scope = button.dataset.contributionScope;
    evidenceIds = null;
    document.querySelectorAll('[data-contribution-scope]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    const next = new URL(location.href); next.searchParams.set('contributions', scope); history.replaceState(null, '', next);
    render();
  });
  shelf?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-evidence-ids]');
    if (!button || button.disabled) return;
    evidenceIds = new Set(button.dataset.evidenceIds.split(','));
    render();
  });
  load().catch((error) => { console.error('boplog contribution load failed', error); list.textContent = 'Contribution receipts could not be loaded.'; });
})();
