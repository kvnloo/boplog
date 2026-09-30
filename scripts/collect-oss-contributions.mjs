#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { buildDataset } from './oss-contributions-lib.mjs';

const API = 'https://api.github.com';
const account = process.env.GITHUB_USER || 'kvnloo';
let token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
if (!token) {
  try {
    token = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    // anonymous public API fallback
  }
}

const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'boplog-oss-collector',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

let lastRateState = null;

function captureRate(response, label) {
  const remaining = Number(response.headers.get('x-ratelimit-remaining'));
  const limit = Number(response.headers.get('x-ratelimit-limit'));
  const used = Number(response.headers.get('x-ratelimit-used'));
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  if (!Number.isFinite(remaining)) return;
  lastRateState = {
    label,
    remaining,
    limit: Number.isFinite(limit) ? limit : null,
    used: Number.isFinite(used) ? used : null,
    reset: Number.isFinite(reset) ? new Date(reset * 1000).toISOString() : null,
  };
  if (remaining <= 150) {
    console.log(
      `[oss] rate ${label}: remaining=${remaining}/${lastRateState.limit ?? '?'} used=${lastRateState.used ?? '?'} reset=${lastRateState.reset ?? '?'}`,
    );
  }
}

async function request(url, attempt = 0) {
  const target = url.startsWith('http') ? url : `${API}${url}`;
  const response = await fetch(target, { headers });
  captureRate(response, url);
  if ((response.status === 403 || response.status === 429 || response.status >= 500) && attempt < 5) {
    const retryAfter = Number(response.headers.get('retry-after'));
    const reset = Number(response.headers.get('x-ratelimit-reset'));
    const resetWait = Number.isFinite(reset)
      ? Math.max(1, Math.ceil(reset - Date.now() / 1000) + 1)
      : 0;
    const waitSeconds = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter
      : resetWait > 0 && resetWait <= 90
        ? resetWait
        : Math.min(30, (attempt + 1) * 4);
    console.log(`[oss] retrying ${url} after ${waitSeconds}s (status=${response.status}, attempt=${attempt + 1})`);
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
    return request(url, attempt + 1);
  }
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return response.json();
}

async function search(query) {
  const records = [];
  let total = 0;
  for (let page = 1; page <= 10; page += 1) {
    const result = await request(
      `/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=100&page=${page}`,
    );
    total = result.total_count;
    records.push(...result.items);
    if (records.length >= Math.min(total, 1000)) break;
  }
  return { records, capped: total > 1000 };
}

const repoCache = new Map();
async function repository(fullName) {
  if (!repoCache.has(fullName)) {
    repoCache.set(fullName, (async () => {
      const [owner] = fullName.split('/');
      if (owner.toLowerCase() === account.toLowerCase()) {
        return { owner, isFork: false, parent: null };
      }
      const repo = await request(`/repos/${fullName}`);
      return {
        owner: repo.owner.login,
        isFork: repo.fork,
        parent: repo.parent?.full_name || null,
      };
    })());
  }
  return repoCache.get(fullName);
}

const querySpecs = [
  {
    query: `type:pr author:${account} is:public is:merged`,
    kind: 'pull_request',
    state: 'closed',
    draft: false,
    merged: true,
  },
  {
    query: `type:pr author:${account} is:public is:open is:draft`,
    kind: 'pull_request',
    state: 'open',
    draft: true,
    merged: false,
  },
  {
    query: `type:pr author:${account} is:public is:open -is:draft`,
    kind: 'pull_request',
    state: 'open',
    draft: false,
    merged: false,
  },
  {
    query: `type:pr author:${account} is:public is:closed is:unmerged`,
    kind: 'pull_request',
    state: 'closed',
    draft: false,
    merged: false,
  },
  {
    query: `type:issue author:${account} is:public`,
    kind: 'issue',
  },
];

// GitHub Search has a much smaller, independent rate bucket than the core
// REST API. Run state partitions sequentially so pagination cannot stampede
// the ~30 requests/minute search budget. request() waits for the advertised
// reset when the bucket reaches zero.
const searchResults = [];
for (const spec of querySpecs) {
  searchResults.push({ spec, result: await search(spec.query) });
}

const raw = [];
for (const { spec, result } of searchResults) {
  for (const item of result.records) {
    const repo = item.repository_url.split('/repos/')[1];
    const base = {
      kind: spec.kind,
      repo,
      number: item.number,
      title: item.title,
      url: item.html_url,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      state: spec.kind === 'issue' ? item.state : spec.state,
      repository: await repository(repo),
    };

    if (spec.kind === 'issue') {
      raw.push(base);
      continue;
    }

    let mergedAt = null;
    if (spec.merged) {
      // Exact merge timestamps are worth one detail request, but only for the
      // comparatively small set of landed PRs. Open/closed/draft status comes
      // directly from partitioned search queries and needs no N-per-PR fetch.
      const detail = await request(`/repos/${repo}/pulls/${item.number}`);
      mergedAt = detail.merged_at;
    }

    raw.push({
      ...base,
      draft: spec.draft,
      mergedAt,
    });
  }
}

const scopes = JSON.parse(
  await readFile(new URL('../data/oss-scopes.json', import.meta.url), 'utf8'),
);
const verifiedImpact = JSON.parse(
  await readFile(new URL('../data/oss-verified-impact.json', import.meta.url), 'utf8'),
);
const cappedQueries = searchResults
  .filter(({ result }) => result.capped)
  .map(({ spec }) => spec.query);

const dataset = buildDataset({
  account,
  generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  raw,
  scopes,
  search: {
    complete: cappedQueries.length === 0,
    cappedQueries,
  },
  verifiedImpact,
});

const output = `${JSON.stringify(dataset, null, 2)}\n`;
if (process.argv.includes('--stdout')) {
  process.stdout.write(output);
} else {
  await writeFile(new URL('../data/oss-contributions.json', import.meta.url), output);
  console.log(
    `Collected ${dataset.contributions.length} public contributions; complete=${dataset.completeness.complete}.`,
  );
  if (lastRateState) {
    console.log(
      `[oss] final rate: remaining=${lastRateState.remaining}/${lastRateState.limit ?? '?'} used=${lastRateState.used ?? '?'} reset=${lastRateState.reset ?? '?'}`,
    );
  }
}
