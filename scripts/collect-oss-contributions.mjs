#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { buildDataset } from './oss-contributions-lib.mjs';

const API = 'https://api.github.com';
const account = process.env.GITHUB_USER || 'kvnloo';
let token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
if (!token) {
  try { token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* anonymous public API fallback */ }
}
const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'boplog-oss-collector', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

async function request(url, attempt = 0) {
  const response = await fetch(url.startsWith('http') ? url : `${API}${url}`, { headers });
  if ((response.status === 403 || response.status === 429) && attempt < 4) {
    const waitSeconds = Number(response.headers.get('retry-after')) || (attempt + 1) * 8;
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
    return request(url, attempt + 1);
  }
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

async function search(query) {
  const records = [];
  let total = 0;
  for (let page = 1; page <= 10; page += 1) {
    const result = await request(`/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=100&page=${page}`);
    total = result.total_count;
    records.push(...result.items);
    if (records.length >= Math.min(total, 1000)) break;
  }
  return { records, capped: total > 1000 };
}

const repoCache = new Map();
async function repository(fullName) {
  if (!repoCache.has(fullName)) repoCache.set(fullName, request(`/repos/${fullName}`));
  const repo = await repoCache.get(fullName);
  return { owner: repo.owner.login, isFork: repo.fork, parent: repo.parent?.full_name || null };
}

async function normalize(item) {
  const repo = item.repository_url.split('/repos/')[1];
  const base = {
    kind: item.pull_request ? 'pull_request' : 'issue', repo, number: item.number,
    title: item.title, url: item.html_url, createdAt: item.created_at, updatedAt: item.updated_at,
    state: item.state, repository: await repository(repo),
  };
  if (!item.pull_request) return base;
  const detail = await request(`/repos/${repo}/pulls/${item.number}`);
  return { ...base, draft: Boolean(detail.draft), mergedAt: detail.merged_at };
}

const queries = [`type:pr author:${account} is:public`, `type:issue author:${account} is:public`];
const results = await Promise.all(queries.map(search));
const queued = results.flatMap((result) => result.records);
const raw = [];
for (const item of queued) {
  raw.push(await normalize(item));
  await new Promise((resolve) => setTimeout(resolve, 120));
}
const scopes = JSON.parse(await readFile(new URL('../data/oss-scopes.json', import.meta.url), 'utf8'));
const verifiedImpact = JSON.parse(await readFile(new URL('../data/oss-verified-impact.json', import.meta.url), 'utf8'));
const cappedQueries = queries.filter((_, index) => results[index].capped);
const dataset = buildDataset({ account, generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), raw, scopes, search: { complete: cappedQueries.length === 0, cappedQueries }, verifiedImpact });
const output = `${JSON.stringify(dataset, null, 2)}\n`;
if (process.argv.includes('--stdout')) process.stdout.write(output);
else {
  await writeFile(new URL('../data/oss-contributions.json', import.meta.url), output);
  console.log(`Collected ${dataset.contributions.length} public contributions; complete=${dataset.completeness.complete}.`);
}
