import { badgesFor, filterContributions, summarizeContributions } from './scripts/contributions.mjs';

export function parseContributionState(search = '') {
  const params = new URLSearchParams(search);
  const requested = params.get('contributions');
  const scope = ['upstream', 'all', 'selected'].includes(requested) ? requested : 'upstream';
  const communities = [...new Set((params.get('communities') || '').split(',').map((value) => value.trim()).filter(Boolean))];
  return { scope, communities };
}

export function contributionViewModel(allRows, state) {
  const rows = filterContributions(allRows, state);
  return { rows, summary: summarizeContributions(rows), badges: badgesFor(rows), empty: rows.length === 0 };
}

function startBrowserUi() {
  const counters = document.querySelector('#contribution-counters');
  const list = document.querySelector('#contribution-list');
  const shelf = document.querySelector('#badge-shelf');
  const limitations = document.querySelector('#contribution-limitations');
  const communityInput = document.querySelector('#contribution-communities');
  const escapeHtml = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  let ledger;
  let state = parseContributionState(location.search);
  let evidenceIds = null;

  function syncUrl() {
    const next = new URL(location.href);
    next.searchParams.set('contributions', state.scope);
    if (state.communities.length) next.searchParams.set('communities', state.communities.join(','));
    else next.searchParams.delete('communities');
    history.replaceState(null, '', next);
  }

  function render() {
    const model = contributionViewModel(ledger.contributions, state);
    let rows = evidenceIds ? model.rows.filter((row) => evidenceIds.has(row.id)) : model.rows;
    const values = [
      ['merged upstream PRs', model.summary.mergedUpstreamPrs],
      ['adopted changes', model.summary.adoptedChanges],
      ['accepted issues / reproductions / reviews', model.summary.acceptedCommunityWork],
      ['open-ready', model.summary.openReady],
      ['communities', model.summary.communities],
    ];
    counters.innerHTML = values.map(([label, value]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join('');
    shelf.innerHTML = model.badges.map((badge) => `<button type="button" data-evidence-ids="${badge.evidenceIds.join(',')}" ${badge.unlocked ? '' : 'disabled'}><span>${badge.unlocked ? '◆' : '◇'} ${escapeHtml(badge.label)}</span><small>${escapeHtml(badge.unlocked ? 'open evidence' : badge.condition)}</small></button>`).join('');
    list.innerHTML = rows.length ? rows.map((row) => `<article class="contribution-row" id="receipt-${escapeHtml(row.id)}"><div><span class="impact impact--${escapeHtml(row.disposition)}">${escapeHtml(['accepted', 'adopted'].includes(row.disposition) ? 'accepted impact' : 'activity')}</span><span>${escapeHtml(row.relationship.replaceAll('_', ' '))}</span></div><div><h3><a href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">${escapeHtml(row.title)} ↗</a></h3><p>${escapeHtml(row.repository)} · ${escapeHtml(row.kind.replaceAll('_', ' '))} · ${escapeHtml(row.lifecycle.replaceAll('_', ' '))}</p></div><div>${row.evidence.map((item, index) => `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">evidence ${index + 1} ↗</a>`).join(' ')}</div></article>`).join('') : '<p>No public receipts in this scope.</p>';
    limitations.textContent = ledger.sourceReceipt.limitations.join(' ');
    document.querySelectorAll('[data-contribution-scope]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.contributionScope === state.scope)));
    if (communityInput) communityInput.value = state.communities.join(',');
  }

  async function load() {
    const response = await fetch('./data/contributions.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`contributions: ${response.status}`);
    ledger = await response.json();
    render();
  }
  document.querySelector('.scope-tabs')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-contribution-scope]');
    if (!button || !ledger) return;
    state = { ...state, scope: button.dataset.contributionScope };
    evidenceIds = null;
    syncUrl();
    render();
  });
  communityInput?.addEventListener('change', () => {
    state = { scope: 'selected', communities: [...new Set(communityInput.value.split(',').map((value) => value.trim()).filter(Boolean))] };
    evidenceIds = null;
    syncUrl();
    render();
  });
  shelf?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-evidence-ids]');
    if (!button || button.disabled) return;
    evidenceIds = new Set(button.dataset.evidenceIds.split(','));
    render();
  });
  load().catch((error) => { console.error('boplog contribution load failed', error); list.textContent = 'Contribution receipts could not be loaded.'; });
}

if (typeof document !== 'undefined') startBrowserUi();
