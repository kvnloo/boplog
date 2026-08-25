const RELATIONSHIPS = new Set(['canonical_upstream', 'contributor_fork', 'owned']);
const PR_STATUSES = new Set(['merged', 'open_ready', 'open_draft', 'closed_unmerged']);
const ISSUE_STATUSES = new Set(['open', 'closed']);
const IMPACT_TYPES = new Set(['merged_pr', 'accepted_fix', 'reproduction_used', 'substantive_review_used']);
const GITHUB_URL = /^https:\/\/github\.com\/[^/]+\/[^/]+\/(pull|issues)\/\d+(?:[/?#].*)?$/;

function requiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

export function classifyStatus(record) {
  if (record.kind === 'pull_request') {
    if (record.mergedAt && record.state === 'open') throw new Error('ambiguous pull request: mergedAt with open state');
    if (record.mergedAt) return 'merged';
    if (record.state === 'open') return record.draft ? 'open_draft' : 'open_ready';
    if (record.state === 'closed') return 'closed_unmerged';
  }
  if (record.kind === 'issue' && ISSUE_STATUSES.has(record.state)) return record.state;
  throw new Error(`ambiguous ${record.kind || 'record'} status`);
}

export function classifyRelationship(record, account) {
  const owner = requiredString(record.repository?.owner, 'repository.owner');
  if (owner.toLowerCase() === account.toLowerCase()) return 'owned';
  if (record.repository?.isFork === true && record.repository?.parent) return 'contributor_fork';
  if (record.repository?.isFork === false) return 'canonical_upstream';
  throw new Error('ambiguous repository relationship');
}

function normalizeRecord(record, account) {
  const repo = requiredString(record.repo, 'repo');
  const kind = requiredString(record.kind, 'kind');
  if (!['pull_request', 'issue'].includes(kind)) throw new Error(`unsupported kind: ${kind}`);
  if (!Number.isInteger(record.number) || record.number < 1) throw new Error('number must be a positive integer');
  const url = requiredString(record.url, 'url');
  if (!GITHUB_URL.test(url)) throw new Error('record requires an exact public GitHub URL');
  const status = classifyStatus(record);
  const relationship = classifyRelationship(record, account);
  return {
    key: `${repo}:${kind}:${record.number}`,
    kind, relationship, status, repo, number: record.number,
    title: requiredString(record.title, 'title'), url,
    createdAt: requiredString(record.createdAt, 'createdAt'),
    updatedAt: requiredString(record.updatedAt, 'updatedAt'),
    ...(record.mergedAt ? { mergedAt: record.mergedAt } : {}),
  };
}

function summarize(contributions, verifiedImpact) {
  const upstream = contributions.filter((item) => item.relationship === 'canonical_upstream');
  return {
    mergedUpstreamPullRequests: upstream.filter((item) => item.kind === 'pull_request' && item.status === 'merged').length,
    openReadyUpstreamPullRequests: upstream.filter((item) => item.kind === 'pull_request' && item.status === 'open_ready').length,
    draftUpstreamPullRequests: upstream.filter((item) => item.kind === 'pull_request' && item.status === 'open_draft').length,
    upstreamIssuesAndProposals: upstream.filter((item) => item.kind === 'issue').length,
    distinctUpstreamCommunities: new Set(upstream.map((item) => item.repo)).size,
    verifiedImpact: verifiedImpact.length,
  };
}

export function deriveBadges(contributions, verifiedImpact) {
  const landed = contributions.filter((item) => item.relationship === 'canonical_upstream' && item.kind === 'pull_request' && item.status === 'merged');
  const communities = new Set(landed.map((item) => item.repo)).size;
  const evidence = (type) => verifiedImpact.filter((item) => item.type === type);
  const badge = (id, name, rule, unlocked, nextCondition, extra = {}) => ({ id, name, rule, unlocked, nextCondition, ...extra });
  const bridgeTier = communities >= 10 ? 'aurora' : communities >= 5 ? 'glass' : communities >= 2 ? 'copper' : 'locked';
  const accepted = evidence('accepted_fix');
  const linkedOutcome = verifiedImpact.filter((item) => ['accepted_fix', 'merged_pr'].includes(item.type) && item.relatedContributionKey?.includes(':issue:'));
  return [
    badge('first-landing', 'first landing', '1 merged canonical-upstream pull request', landed.length >= 1, `${Math.max(0, 1 - landed.length)} more merged upstream PR`, { tier: landed.length ? 'copper' : 'locked', filter: { scope: 'upstream', status: 'merged' } }),
    badge('bridge-builder', 'bridge builder', 'merged work in 2 / 5 / 10 distinct upstream communities', communities >= 2, communities < 2 ? `${2 - communities} more upstream communities` : communities < 5 ? `${5 - communities} more for glass` : communities < 10 ? `${10 - communities} more for aurora` : 'highest published tier reached', { tier: bridgeTier, filter: { scope: 'upstream', status: 'merged' } }),
    badge('bug-cartographer', 'bug cartographer', 'a checked reproduction_used receipt', evidence('reproduction_used').length > 0, 'add a checked substantive reproduction receipt', { tier: evidence('reproduction_used').length ? 'glass' : 'locked', evidenceUrls: evidence('reproduction_used').map((item) => item.evidenceUrl) }),
    badge('review-craft', 'review craft', 'a checked substantive_review_used receipt', evidence('substantive_review_used').length > 0, 'add a checked substantive review receipt', { tier: evidence('substantive_review_used').length ? 'glass' : 'locked', evidenceUrls: evidence('substantive_review_used').map((item) => item.evidenceUrl) }),
    badge('maintainer-signal', 'maintainer signal', 'a checked accepted_fix receipt or 3 merged canonical-upstream PRs', accepted.length > 0 || landed.length >= 3, accepted.length || landed.length >= 3 ? 'condition met' : `${3 - landed.length} more merged upstream PRs or an accepted-fix receipt`, { tier: accepted.length || landed.length >= 3 ? 'aurora' : 'locked', evidenceUrls: accepted.map((item) => item.evidenceUrl), filter: { scope: 'upstream', status: 'merged' } }),
    badge('open-loop', 'open loop', 'an issue/proposal linked by receipt to a merged or accepted outcome', linkedOutcome.length > 0, 'link an issue receipt to its merged or accepted outcome', { tier: linkedOutcome.length ? 'aurora' : 'locked', evidenceUrls: linkedOutcome.map((item) => item.evidenceUrl) }),
  ];
}

export function buildDataset({ account, generatedAt, raw, scopes, search, verifiedImpact = [] }) {
  requiredString(account, 'account');
  requiredString(generatedAt, 'generatedAt');
  if (!Array.isArray(raw)) throw new Error('raw must be an array');
  if (!Array.isArray(scopes?.groups)) throw new Error('scopes.groups must be an array');
  const byKey = new Map();
  for (const rawRecord of raw) {
    const record = normalizeRecord(rawRecord, account);
    const previous = byKey.get(record.key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(record)) throw new Error(`ambiguous duplicate: ${record.key}`);
    byKey.set(record.key, record);
  }
  const contributions = [...byKey.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.key.localeCompare(b.key));
  const groups = scopes.groups.map((group) => ({
    id: requiredString(group.id, 'group.id'), label: requiredString(group.label, 'group.label'),
    repositories: [...group.repositories].sort(),
    contributionCount: contributions.filter((item) => group.repositories.includes(item.repo)).length,
  }));
  const capped = search?.cappedQueries || [];
  const data = {
    schemaVersion: 1, generatedAt, account,
    definitions: {
      relationships: { canonical_upstream: 'Canonical project owned outside the account.', contributor_fork: 'External fork used to help an upstream lane.', owned: 'Repository owned by the account.' },
      statuses: { merged: 'Pull request has a non-null mergedAt.', open_ready: 'Open, non-draft pull request.', open_draft: 'Open draft pull request.', closed_unmerged: 'Closed pull request with no mergedAt.', open: 'Open issue.', closed: 'Closed issue.' },
      verifiedImpact: 'Manually checked public evidence; never inferred from activity volume.',
    },
    selectedGroups: groups,
    scopes: [{ id: 'all_public', label: 'all public' }, { id: 'upstream', label: 'upstream' }, { id: 'selected', label: 'selected communities' }],
    completeness: { complete: Boolean(search?.complete) && capped.length === 0, limitations: capped.map((query) => `GitHub search cap reached for: ${query}`) },
    summary: summarize(contributions, verifiedImpact), contributions, verifiedImpact,
    badges: deriveBadges(contributions, verifiedImpact),
  };
  validateDataset(data);
  return data;
}

export function validateDataset(data) {
  if (data.schemaVersion !== 1) throw new Error('schemaVersion must be 1');
  const keys = new Set();
  for (const record of data.contributions || []) {
    if (keys.has(record.key)) throw new Error(`duplicate contribution: ${record.key}`);
    keys.add(record.key);
    if (!RELATIONSHIPS.has(record.relationship)) throw new Error(`invalid relationship: ${record.key}`);
    if (record.kind === 'pull_request' ? !PR_STATUSES.has(record.status) : !ISSUE_STATUSES.has(record.status)) throw new Error(`invalid status: ${record.key}`);
    if (!GITHUB_URL.test(record.url)) throw new Error(`record requires exact public GitHub URL: ${record.key}`);
  }
  for (const [index, impact] of (data.verifiedImpact || []).entries()) {
    if (!IMPACT_TYPES.has(impact.type) || !GITHUB_URL.test(impact.evidenceUrl || '')) throw new Error(`verifiedImpact[${index}] requires an allowed type and exact public GitHub evidence URL`);
    if (impact.relatedContributionKey && !keys.has(impact.relatedContributionKey)) throw new Error(`verifiedImpact[${index}] related contribution does not exist`);
  }
  const expected = summarize(data.contributions || [], data.verifiedImpact || []);
  if (JSON.stringify(expected) !== JSON.stringify(data.summary)) throw new Error('summary does not reconcile with contribution records');
  return true;
}
