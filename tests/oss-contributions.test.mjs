import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDataset,
  classifyRelationship,
  classifyStatus,
  deriveBadges,
  validateDataset,
} from '../scripts/oss-contributions-lib.mjs';

const scopes = {
  schemaVersion: 1,
  groups: [
    { id: 'hermes', label: 'Hermes', repositories: ['NousResearch/hermes-agent'] },
    { id: 'rust', label: 'Rust', repositories: ['rust-lang/rust'] },
  ],
};

function pr(overrides = {}) {
  return {
    kind: 'pull_request', repo: 'NousResearch/hermes-agent', number: 7,
    title: 'Fix collector', url: 'https://github.com/NousResearch/hermes-agent/pull/7',
    createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-02T00:00:00Z',
    state: 'closed', draft: false, mergedAt: '2026-08-02T00:00:00Z',
    repository: { owner: 'NousResearch', isFork: false, parent: null }, ...overrides,
  };
}

test('classifies merged separately from closed-unmerged and draft from ready', () => {
  assert.equal(classifyStatus(pr()), 'merged');
  assert.equal(classifyStatus(pr({ mergedAt: null })), 'closed_unmerged');
  assert.equal(classifyStatus(pr({ state: 'open', mergedAt: null })), 'open_ready');
  assert.equal(classifyStatus(pr({ state: 'open', draft: true, mergedAt: null })), 'open_draft');
});

test('classifies owned, canonical upstream, and contributor fork without conflation', () => {
  assert.equal(classifyRelationship(pr(), 'kvnloo'), 'canonical_upstream');
  assert.equal(classifyRelationship(pr({ repo: 'kvnloo/tool', repository: { owner: 'kvnloo', isFork: false, parent: null } }), 'kvnloo'), 'owned');
  assert.equal(classifyRelationship(pr({ repo: 'helper/tool', repository: { owner: 'helper', isFork: true, parent: 'upstream/tool' } }), 'kvnloo'), 'contributor_fork');
});

test('dedupes records, preserves selected zeroes, and reports search cap limitations', () => {
  const data = buildDataset({ account: 'kvnloo', generatedAt: '2026-08-25T00:00:00Z', raw: [pr(), pr()], scopes, search: { complete: false, cappedQueries: ['type:pr author:kvnloo'] }, verifiedImpact: [] });
  assert.equal(data.contributions.length, 1);
  assert.equal(data.summary.mergedUpstreamPullRequests, 1);
  assert.deepEqual(data.selectedGroups.map(({ id, contributionCount }) => [id, contributionCount]), [['hermes', 1], ['rust', 0]]);
  assert.equal(data.completeness.complete, false);
  assert.match(data.completeness.limitations[0], /search cap/i);
});

test('verified impact requires an allowed type and exact public GitHub evidence URL', () => {
  assert.throws(() => buildDataset({ account: 'kvnloo', generatedAt: '2026-08-25T00:00:00Z', raw: [pr()], scopes, search: { complete: true, cappedQueries: [] }, verifiedImpact: [{ type: 'comment_count', evidenceUrl: 'https://github.com/x/y/issues/1' }] }), /verifiedImpact/);
  const valid = buildDataset({ account: 'kvnloo', generatedAt: '2026-08-25T00:00:00Z', raw: [pr()], scopes, search: { complete: true, cappedQueries: [] }, verifiedImpact: [{ type: 'merged_pr', evidenceUrl: 'https://github.com/NousResearch/hermes-agent/pull/7', relatedContributionKey: 'NousResearch/hermes-agent:pull_request:7' }] });
  assert.doesNotThrow(() => validateDataset(valid));
  assert.equal(valid.summary.verifiedImpact, 1);
});

test('fails closed on malformed or ambiguous public records', () => {
  assert.throws(() => buildDataset({ account: 'kvnloo', generatedAt: '2026-08-25T00:00:00Z', raw: [pr({ mergedAt: '2026-08-02T00:00:00Z', state: 'open' })], scopes, search: { complete: true, cappedQueries: [] }, verifiedImpact: [] }), /ambiguous/i);
  assert.throws(() => buildDataset({ account: 'kvnloo', generatedAt: '2026-08-25T00:00:00Z', raw: [pr({ url: 'http://example.test/private' })], scopes, search: { complete: true, cappedQueries: [] }, verifiedImpact: [] }), /public GitHub URL/i);
});

test('badge unlocks derive only from landed upstream work or verified receipts', () => {
  const contributions = [pr(), pr({ repo: 'python/cpython', number: 8, url: 'https://github.com/python/cpython/pull/8' })]
    .map((item) => buildDataset({ account: 'kvnloo', generatedAt: '2026-08-25T00:00:00Z', raw: [item], scopes, search: { complete: true, cappedQueries: [] }, verifiedImpact: [] }).contributions[0]);
  const badges = deriveBadges(contributions, [{ type: 'reproduction_used', evidenceUrl: 'https://github.com/python/cpython/issues/9' }]);
  assert.equal(badges.find((badge) => badge.id === 'first-landing').unlocked, true);
  assert.equal(badges.find((badge) => badge.id === 'bridge-builder').tier, 'copper');
  assert.equal(badges.find((badge) => badge.id === 'bug-cartographer').unlocked, true);
  assert.equal(badges.find((badge) => badge.id === 'review-craft').unlocked, false);
  assert.match(badges.find((badge) => badge.id === 'review-craft').nextCondition, /substantive review/i);
});
