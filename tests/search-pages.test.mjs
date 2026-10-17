import test from 'node:test';
import assert from 'node:assert/strict';
import { collectSearchRecords } from '../scripts/search-pages.mjs';

test('paginates a normal Search query without discarding the second page', async () => {
  const calls = [];
  const result = await collectSearchRecords('type:pr is:public', async (url) => {
    const page = Number(new URL(url, 'https://api.github.com').searchParams.get('page'));
    calls.push(page);
    const item = (number) => ({ html_url: 'https://github.com/example/repo/pull/' + number, number });
    return { total_count: 101, incomplete_results: false, items: page === 1 ? Array.from({ length: 100 }, (_, i) => item(i + 1)) : [item(101)] };
  });
  assert.equal(result.records.length, 101);
  assert.equal(result.capped, false);
  assert.deepEqual(calls, [1, 2]);
});

test('recursively divides a query over the 1k GitHub Search cap', async () => {
  const queries = [];
  const result = await collectSearchRecords('type:issue author:kvnloo is:public', async (url) => {
    const query = new URL(url, 'https://api.github.com').searchParams.get('q');
    queries.push(query);
    if (!query.includes('created:')) return { total_count: 2000, items: [], incomplete_results: false };
    if (query.includes('created:2008-01-01..2026-12-31')) return { total_count: 2000, items: [], incomplete_results: false };
    return { total_count: 1, items: [{ html_url: 'https://github.com/example/repo/issues/' + queries.length }], incomplete_results: false };
  });
  assert.equal(result.capped, false);
  assert.equal(result.records.length, 2);
  assert.ok(queries.some((query) => /created:2008-01-01/.test(query)));
  assert.ok(queries.some((query) => /\.\.2026-12-31/.test(query)));
});

test('reports incomplete Search results instead of claiming completeness', async () => {
  const data = await collectSearchRecords('type:issue author:kvnloo is:public', async () => ({
    total_count: 1,
    incomplete_results: true,
    items: [{ html_url: 'https://github.com/example/repo/issues/1' }],
  }));
  assert.equal(data.capped, true);
  assert.ok(data.limitations.some((reason) => reason.includes('incomplete_results')));
});
