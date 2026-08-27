import assert from 'node:assert/strict';
import test from 'node:test';
import {
  badgesFor,
  filterContributions,
  mergeGithubRefresh,
  summarizeContributions,
  validateContributionLedger,
} from '../scripts/contributions.mjs';

const evidence = { url: 'https://github.com/acme/tool/pull/1', observedAt: '2026-08-27T00:00:00Z', proof: { type: 'merged_pr', url: 'https://github.com/acme/tool/pull/1' } };
const contribution = (overrides = {}) => ({
  id: 'acme-tool-pr-1', identity: 'acme/tool#1', repository: 'acme/tool', community: 'acme', relationship: 'canonical_upstream', kind: 'pull_request', lifecycle: 'merged', disposition: 'accepted', headline: true, title: 'A fix', number: 1, url: evidence.url, authoredCommits: ['a'.repeat(40)], evidence: [evidence], ...overrides,
});

test('merged and closed-unmerged PRs remain distinct', () => {
  const rows = [contribution(), contribution({ id: 'closed', identity: 'acme/tool#2', number: 2, lifecycle: 'closed_unmerged', disposition: 'rejected', headline: false })];
  assert.deepEqual(summarizeContributions(rows).mergedUpstreamPrs, 1);
});

test('adopted commit is accepted only with attribution-grade proof', () => {
  const valid = contribution({ id: 'adopted', identity: 'patch:a', kind: 'commit_adoption', lifecycle: 'adopted', disposition: 'adopted', sourceCommit: 'b'.repeat(40), destinationCommit: 'c'.repeat(40), evidence: [{ ...evidence, proof: { type: 'patch_id', sourcePatchId: 'd'.repeat(40), destinationPatchId: 'd'.repeat(40) } }] });
  assert.equal(validateContributionLedger({ contributions: [valid], sourceReceipt: { complete: true } }).length, 0);
  const invalid = structuredClone(valid); invalid.evidence[0].proof = { type: 'similar_code' };
  assert.match(validateContributionLedger({ contributions: [invalid], sourceReceipt: { complete: true } }).join('\n'), /attribution-grade proof/);
});

test('linked PR and adopted commit produce one headline receipt', () => {
  const rows = [contribution(), contribution({ id: 'adopted', identity: 'patch:a', kind: 'commit_adoption', lifecycle: 'adopted', disposition: 'adopted', headline: false, linkedIdentity: 'acme/tool#1', sourceCommit: 'a'.repeat(40), destinationCommit: 'b'.repeat(40), evidence: [{ ...evidence, proof: { type: 'explicit_pr_linkage', pullRequest: evidence.url } }] })];
  assert.deepEqual(summarizeContributions(rows), { mergedUpstreamPrs: 1, adoptedChanges: 0, acceptedCommunityWork: 0, openReady: 0, communities: 1, headlineImpact: 1 });
});

test('owned and contributor fork work are excluded from upstream scope', () => {
  const rows = [contribution(), contribution({ id: 'fork', relationship: 'contributor_fork' }), contribution({ id: 'owned', relationship: 'owned' })];
  assert.equal(filterContributions(rows, { scope: 'upstream' }).length, 1);
});

test('issue activity is not accepted impact without accepted disposition', () => {
  const rows = [contribution({ kind: 'issue', lifecycle: 'open', disposition: 'activity_only', headline: false })];
  assert.equal(summarizeContributions(rows).acceptedCommunityWork, 0);
});

test('reproduction and review require a public maintainer citation', () => {
  for (const kind of ['reproduction', 'review']) {
    const row = contribution({ kind, lifecycle: 'closed', evidence: [{ ...evidence, proof: { type: 'maintainer_acknowledgement', url: evidence.url } }] });
    assert.equal(validateContributionLedger({ contributions: [row], sourceReceipt: { complete: true } }).length, 0);
    delete row.evidence[0].proof.url;
    assert.match(validateContributionLedger({ contributions: [row], sourceReceipt: { complete: true } }).join('\n'), /maintainer citation/);
  }
});

test('unknown attribution is excluded from headline impact', () => {
  assert.equal(summarizeContributions([contribution({ disposition: 'unknown' })]).headlineImpact, 0);
});

test('selected community can have zero rows', () => {
  assert.deepEqual(filterContributions([contribution()], { scope: 'selected', communities: ['none'] }), []);
});

test('badges expose evidence filters and exact locked next conditions', () => {
  const unlocked = badgesFor([contribution()]);
  assert.equal(unlocked.find((badge) => badge.id === 'first-upstream-merge').unlocked, true);
  assert.deepEqual(unlocked.find((badge) => badge.id === 'first-upstream-merge').evidenceIds, ['acme-tool-pr-1']);
  assert.equal(unlocked.find((badge) => badge.id === 'adopted-patch').condition, '1 adopted change with attribution-grade public evidence');
});

test('incomplete source receipt declares cap and limitation', () => {
  const errors = validateContributionLedger({ contributions: [contribution()], sourceReceipt: { complete: false, searchCap: 1000, limitations: ['GitHub search returned at most 1,000 results'] } });
  assert.equal(errors.length, 0);
});

test('GitHub refresh preserves explicit verified-impact records', () => {
  const explicit = contribution({ kind: 'commit_adoption', lifecycle: 'adopted', disposition: 'adopted', source: 'verified_impact' });
  const refreshed = mergeGithubRefresh([explicit], [{ identity: explicit.identity, lifecycle: 'closed_unmerged', disposition: 'rejected' }]);
  assert.equal(refreshed[0].lifecycle, 'adopted');
  assert.equal(refreshed[0].disposition, 'adopted');
});
