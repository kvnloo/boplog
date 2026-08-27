const ACCEPTED = new Set(['accepted', 'adopted']);
const ADOPTION_PROOFS = new Set(['git_ancestry', 'patch_id', 'maintainer_acknowledgement', 'explicit_pr_linkage']);
const DISPOSITIONS = new Set(['accepted', 'adopted', 'rejected', 'activity_only', 'unknown']);
const STATUS_CONTRACT = {
  pull_request: { open_ready: new Set(['activity_only', 'unknown']), merged: new Set(['accepted']), closed_unmerged: new Set(['rejected']) },
  issue: { open: new Set(['activity_only', 'unknown']), closed: new Set(['accepted', 'rejected', 'activity_only', 'unknown']) },
  commit_adoption: { adopted: new Set(['adopted']), not_adopted: new Set(['rejected']), unknown: new Set(['activity_only', 'unknown']) },
  reproduction: { open: new Set(['activity_only', 'unknown']), closed: new Set(['accepted', 'rejected', 'activity_only', 'unknown']) },
  review: { open: new Set(['activity_only', 'unknown']), closed: new Set(['accepted', 'rejected', 'activity_only', 'unknown']) },
  documentation: { open_ready: new Set(['activity_only', 'unknown']), merged: new Set(['accepted']), closed_unmerged: new Set(['rejected']) },
  test_or_fixture: { open_ready: new Set(['activity_only', 'unknown']), merged: new Set(['accepted']), closed_unmerged: new Set(['rejected']) },
};

function isPublicHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function mergeGithubRefresh(existing, refreshed) {
  const updates = new Map(refreshed.map((row) => [row.identity, row]));
  const merged = existing.map((row) => row.source === 'verified_impact' ? row : { ...row, ...(updates.get(row.identity) || {}) });
  const identities = new Set(existing.map((row) => row.identity));
  return merged.concat(refreshed.filter((row) => !identities.has(row.identity)));
}

export function filterContributions(rows, { scope = 'all', communities = [] } = {}) {
  if (scope === 'upstream') return rows.filter((row) => row.relationship === 'canonical_upstream');
  if (scope === 'selected') return rows.filter((row) => communities.includes(row.community));
  return rows;
}

export function summarizeContributions(rows) {
  const headline = rows.filter((row) => row.headline && ACCEPTED.has(row.disposition));
  return {
    mergedUpstreamPrs: headline.filter((row) => row.relationship === 'canonical_upstream' && row.kind === 'pull_request' && row.lifecycle === 'merged').length,
    adoptedChanges: headline.filter((row) => row.kind === 'commit_adoption' && row.disposition === 'adopted').length,
    acceptedCommunityWork: headline.filter((row) => ['issue', 'reproduction', 'review'].includes(row.kind)).length,
    openReady: rows.filter((row) => row.lifecycle === 'open_ready').length,
    communities: new Set(headline.map((row) => row.community)).size,
    headlineImpact: headline.length,
  };
}

export function badgesFor(rows) {
  const summary = summarizeContributions(rows);
  const evidence = (predicate) => rows.filter(predicate).map((row) => row.id);
  const definitions = [
    ['first-upstream-merge', 'First upstream merge', '1 merged PR in a canonical upstream', summary.mergedUpstreamPrs >= 1, (row) => row.headline && row.relationship === 'canonical_upstream' && row.kind === 'pull_request' && row.lifecycle === 'merged'],
    ['adopted-patch', 'Adopted patch', '1 adopted change with attribution-grade public evidence', summary.adoptedChanges >= 1, (row) => row.headline && row.kind === 'commit_adoption' && row.disposition === 'adopted'],
    ['reproduction-used', 'Reproduction used', '1 reproduction accepted with a public maintainer citation', rows.some((row) => row.headline && row.kind === 'reproduction' && ACCEPTED.has(row.disposition)), (row) => row.headline && row.kind === 'reproduction'],
    ['review-changed-outcome', 'Review changed outcome', '1 review accepted with a public maintainer citation', rows.some((row) => row.headline && row.kind === 'review' && ACCEPTED.has(row.disposition)), (row) => row.headline && row.kind === 'review'],
  ];
  const communityTarget = [2, 5, 10].find((target) => summary.communities < target) || 10;
  definitions.push([`communities-${communityTarget}`, `${communityTarget} communities`, `accepted impact in ${communityTarget} canonical upstream communities`, summary.communities >= communityTarget, (row) => row.headline && row.relationship === 'canonical_upstream' && ACCEPTED.has(row.disposition)]);
  return definitions.map(([id, label, condition, unlocked, predicate]) => ({ id, label, condition, unlocked, evidenceIds: unlocked ? evidence(predicate) : [] }));
}

export function validateContributionLedger(ledger) {
  const errors = [];
  const ids = new Set();
  const headlineRows = [];
  const relationships = new Set(['canonical_upstream', 'contributor_fork', 'owned']);
  const kinds = new Set(['pull_request', 'issue', 'commit_adoption', 'reproduction', 'review', 'documentation', 'test_or_fixture']);
  for (const [index, row] of (ledger.contributions || []).entries()) {
    const at = `contributions[${index}]`;
    if (!row.id || ids.has(row.id)) errors.push(`${at}.id must be unique`); ids.add(row.id);
    if (!relationships.has(row.relationship)) errors.push(`${at}.relationship is invalid`);
    if (!kinds.has(row.kind)) errors.push(`${at}.kind is invalid`);
    for (const field of ['id', 'identity', 'repository', 'community', 'relationship', 'kind', 'lifecycle', 'disposition', 'title', 'url']) {
      if (typeof row[field] !== 'string' || !row[field].trim()) errors.push(`${at}.${field} is required`);
    }
    if (typeof row.headline !== 'boolean') errors.push(`${at}.headline is required`);
    if (!DISPOSITIONS.has(row.disposition)) errors.push(`${at}.disposition is invalid`);
    const lifecycleContract = STATUS_CONTRACT[row.kind]?.[row.lifecycle];
    if (STATUS_CONTRACT[row.kind] && !lifecycleContract) errors.push(`${at}.lifecycle is invalid for ${row.kind}`);
    else if (lifecycleContract && !lifecycleContract.has(row.disposition)) errors.push(`${at}.disposition ${row.disposition} is invalid for ${row.kind} lifecycle ${row.lifecycle}`);
    if (!isPublicHttps(row.url)) errors.push(`${at}.url must be a public HTTPS URL`);
    if (!Array.isArray(row.evidence) || !row.evidence.length) errors.push(`${at} requires immutable public evidence`);
    for (const item of row.evidence || []) {
      if (!isPublicHttps(item.url) || typeof item.observedAt !== 'string' || !item.observedAt || !item.proof || typeof item.proof.type !== 'string') errors.push(`${at} evidence requires HTTPS URL, observedAt, and proof shape`);
    }
    if (row.kind === 'commit_adoption' && ACCEPTED.has(row.disposition) && !(row.evidence || []).some((item) => ADOPTION_PROOFS.has(item.proof?.type))) errors.push(`${at} adopted commit requires attribution-grade proof`);
    if (['reproduction', 'review'].includes(row.kind) && ACCEPTED.has(row.disposition) && !(row.evidence || []).some((item) => item.proof?.type === 'maintainer_acknowledgement' && item.proof.url?.startsWith('https://'))) errors.push(`${at} accepted ${row.kind} requires public maintainer citation`);
    if (row.headline) headlineRows.push({ index, row });
  }
  const parent = new Map();
  const root = (identity) => { if (!parent.has(identity)) parent.set(identity, identity); const value = parent.get(identity); if (value !== identity) parent.set(identity, root(value)); return parent.get(identity); };
  const union = (left, right) => { const a = root(left); const b = root(right); if (a !== b) parent.set(b, a); };
  for (const row of ledger.contributions || []) { root(row.identity); if (row.linkedIdentity) union(row.identity, row.linkedIdentity); }
  const groupedHeadlines = new Map();
  for (const { index, row } of headlineRows) {
    const group = root(row.identity);
    if (groupedHeadlines.has(group)) errors.push(`contributions[${index}] duplicate headline in linked identity group with ${groupedHeadlines.get(group)}`);
    else groupedHeadlines.set(group, row.identity);
  }
  const receipt = ledger.sourceReceipt || {};
  if (receipt.complete === false && (!Number.isInteger(receipt.searchCap) || !receipt.limitations?.length)) errors.push('incomplete source receipt requires searchCap and limitations');
  return errors;
}
