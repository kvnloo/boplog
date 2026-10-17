import test from 'node:test';
import assert from 'node:assert/strict';
import { collectMergedAt, exactMergedAt, mergedPrKey } from '../scripts/merged-pr-timestamps.mjs';

const query = 'type:pr author:kvnloo is:public is:merged';
const node = (number, mergedAt) => ({
  number, mergedAt, repository: { nameWithOwner: 'Example/Repo' },
});
const page = (nodes, hasNextPage, endCursor = null, issueCount = nodes.length) => ({
  data: { search: { issueCount, nodes, pageInfo: { hasNextPage, endCursor } } },
});

test('pages exact GitHub merge timestamps using one GraphQL request per 100 items', async () => {
  const calls = [];
  const responses = [
    page([node(12, '2026-10-01T00:00:00Z')], true, 'cursor-1', 2),
    page([node(13, '2026-10-02T00:00:00Z')], false, null, 2),
  ];
  const result = await collectMergedAt(query, async (path, attempt, init) => {
    calls.push({ path, attempt, init });
    return responses.shift();
  });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.path === '/graphql' && call.init.method === 'POST'));
  assert.equal(JSON.parse(calls[1].init.body).variables.after, 'cursor-1');
  assert.match(JSON.parse(calls[0].init.body).variables.query, /sort:updated-desc/);
  assert.equal(result.capped, false);
  assert.equal(result.dates.get(mergedPrKey('example/repo', 12)), '2026-10-01T00:00:00Z');
  assert.equal(exactMergedAt({ repository_url: 'https://api.github.com/repos/EXAMPLE/REPO', number: 13 }, result.dates), '2026-10-02T00:00:00Z');
});

test('fails closed instead of converting absent merged evidence to unmerged', () => {
  assert.throws(() => exactMergedAt({ repository_url: 'https://api.github.com/repos/a/b', number: 99 }, new Map()), /Missing exact mergedAt/);
});

test('fails closed on GraphQL errors and ambiguous data', async () => {
  await assert.rejects(collectMergedAt(query, async () => ({ errors: [{ message: 'resource unavailable' }] })), /GraphQL merge evidence/);
  await assert.rejects(collectMergedAt(query, async () => page([node(15, null)], false)), /without exact public merge evidence/);
  await assert.rejects(collectMergedAt(query, async () => page([node(14, '2026-10-01T00:00:00Z')], true)), /endCursor/);
});

test('propagates GitHub search cap without claiming full coverage', async () => {
  const result = await collectMergedAt(query, async () => page([node(1, '2026-10-01T00:00:00Z')], false, null, 1500));
  assert.equal(result.capped, true);
  assert.equal(result.dates.size, 1);
});

test('max-page boundary marks a truncated crawl', async () => {
  const result = await collectMergedAt(query, async () => page([node(1, '2026-10-01T00:00:00Z')], true, 'cursor', 1000), 1);
  assert.equal(result.capped, true);
});
