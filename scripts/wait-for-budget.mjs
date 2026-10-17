#!/usr/bin/env node
// Wait for enough of this workflow token's primary API budget before starting
// a complete snapshot. Never publish a partial or fabricated fresh dataset.
// Unlike dozens of API retries, GET /rate_limit is not charged to core quota.
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
if (!token) throw new Error('No GitHub token available for the sync preflight');

const minimumCore = Number(process.env.BOPLOG_MIN_CORE || 700);
const minimumGraphql = Number(process.env.BOPLOG_MIN_GRAPHQL || 20);
const waitMinutes = Number(process.env.BOPLOG_BUDGET_WAIT_MINUTES || 75);
const deadline = Date.now() + waitMinutes * 60_000;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

for (;;) {
  const response = await fetch('https://api.github.com/rate_limit', {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error('Cannot establish GitHub rate budget: HTTP ' + response.status);
  }
  const resources = (await response.json()).resources;
  const core = resources?.core;
  const graphql = resources?.graphql;
  if (!core || !graphql) throw new Error('Missing GitHub rate budget resources');
  console.log('[budget] core=' + core.remaining + '/' + core.limit
    + ' graphql=' + graphql.remaining + '/' + graphql.limit
    + ' minimum=' + minimumCore + '/' + minimumGraphql);
  if (core.remaining >= minimumCore && graphql.remaining >= minimumGraphql) {
    console.log('[budget] sufficient budget to begin the complete sync');
    break;
  }

  const resets = [core.remaining < minimumCore ? core.reset : 0, graphql.remaining < minimumGraphql ? graphql.reset : 0];
  const resetMs = Math.max(...resets) * 1000;
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0 || resetMs >= deadline) {
    throw new Error('GitHub API budget exhausted until after the allowed preflight window; leaving checked-in data unchanged');
  }
  const sleepMs = Math.min(remainingMs, Math.max(10_000, resetMs - Date.now() + 5_000));
  console.log('[budget] waiting ' + Math.ceil(sleepMs / 1000) + ' seconds until rate reset');
  await pause(sleepMs);
}
