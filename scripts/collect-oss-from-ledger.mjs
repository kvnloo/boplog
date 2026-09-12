#!/usr/bin/env node
/**
 * Build oss-contributions.json from a local PR ledger + authored issues.
 * Uses GraphQL only for repository isFork/parent (REST core may be exhausted).
 * Does not invent verifiedImpact receipts.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { buildDataset } from './oss-contributions-lib.mjs';

const account = process.env.GITHUB_USER || 'kvnloo';
const ledgerPath = process.env.OSS_LEDGER_JSON;
const issuesPath = process.env.OSS_ISSUES_JSON;
const ownedPath = process.env.OWNED_REPOS_JSON || '';
if (!ledgerPath || !issuesPath) {
  console.error('OSS_LEDGER_JSON and OSS_ISSUES_JSON are required');
  process.exit(1);
}

let token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
if (!token) {
  try { token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* anonymous */ }
}

const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
const issuesFile = JSON.parse(await readFile(issuesPath, 'utf8'));
const issues = issuesFile.items || issuesFile;
const scopes = JSON.parse(await readFile(new URL('../data/oss-scopes.json', import.meta.url), 'utf8'));
const verifiedImpact = JSON.parse(await readFile(new URL('../data/oss-verified-impact.json', import.meta.url), 'utf8'));

const owned = ownedPath ? JSON.parse(await readFile(ownedPath, 'utf8')) : [];
const ownedByName = new Map((Array.isArray(owned) ? owned : []).map((r) => [r.name, r]));

const publicPrs = (ledger.pullRequests || []).filter((p) => p.public && p.url && /^https:\/\/github\.com\//.test(p.url));
const publicIssues = issues.filter((i) => i.html_url && /^https:\/\/github\.com\//.test(i.html_url) && !i.pull_request);

const repoNames = [...new Set([...publicPrs.map((p) => p.repo), ...publicIssues.map((i) => i.repo)])];

const meta = new Map();
for (const full of repoNames) {
  const [owner, name] = full.split('/');
  if (owner.toLowerCase() === account.toLowerCase()) {
    const row = ownedByName.get(name);
    meta.set(full, {
      owner,
      isFork: Boolean(row?.fork),
      parent: null,
    });
  }
}

const external = repoNames.filter((full) => !meta.has(full));

async function graphql(query, variables = {}) {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'boplog-oss-ledger',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`GraphQL ${response.status}: ${(await response.text()).slice(0, 240)}`);
  const payload = await response.json();
  if (payload.errors?.length) {
    const fatal = payload.errors.filter((e) => e.type !== 'NOT_FOUND');
    if (fatal.length) throw new Error(fatal.map((e) => e.message).join('; '));
  }
  return payload.data || {};
}

for (let i = 0; i < external.length; i += 20) {
  const batch = external.slice(i, i + 20);
  const parts = batch.map((full, idx) => {
    const [owner, name] = full.split('/');
    return `r${idx}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { isFork owner { login } parent { nameWithOwner } }`;
  });
  const data = await graphql(`{ ${parts.join('\n')} }`);
  batch.forEach((full, idx) => {
    const row = data[`r${idx}`];
    if (!row) {
      const [owner] = full.split('/');
      meta.set(full, { owner, isFork: false, parent: null });
      return;
    }
    meta.set(full, {
      owner: row.owner.login,
      isFork: Boolean(row.isFork),
      parent: row.parent?.nameWithOwner || null,
    });
  });
}

function repoInfo(full) {
  const row = meta.get(full);
  if (!row) {
    const [owner] = full.split('/');
    return { owner, isFork: false, parent: null };
  }
  return row;
}

const raw = [];
for (const pr of publicPrs) {
  let state = pr.state;
  let draft = Boolean(pr.isDraft);
  if (state === 'draft') { state = 'open'; draft = true; }
  if (state === 'merged') state = 'closed';
  if (pr.mergedAt && state === 'open') state = 'closed';
  raw.push({
    kind: 'pull_request',
    repo: pr.repo,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    createdAt: pr.createdAt,
    updatedAt: pr.updatedAt,
    state,
    draft,
    mergedAt: pr.mergedAt || null,
    repository: repoInfo(pr.repo),
  });
}
for (const issue of publicIssues) {
  raw.push({
    kind: 'issue',
    repo: issue.repo,
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    state: issue.state,
    repository: repoInfo(issue.repo),
  });
}

const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const dataset = buildDataset({
  account,
  generatedAt,
  raw,
  scopes,
  search: { complete: true, cappedQueries: [] },
  verifiedImpact,
});
await writeFile(new URL('../data/oss-contributions.json', import.meta.url), `${JSON.stringify(dataset, null, 2)}\n`);
console.log(JSON.stringify({
  contributions: dataset.contributions.length,
  summary: dataset.summary,
  hermes: dataset.selectedGroups.find((g) => g.id === 'hermes'),
  noctalia: dataset.selectedGroups.find((g) => g.id === 'noctalia'),
  complete: dataset.completeness.complete,
  badges: dataset.badges.map((b) => [b.id, b.unlocked, b.tier]),
}, null, 2));
