#!/usr/bin/env node
/**
 * Sync public build log data from GitHub.
 *
 * Includes repositories the configured user has authored commits in:
 * - all non-fork public repos they own
 * - forks only when they authored at least one commit
 *
 * Auth: GITHUB_TOKEN / GH_TOKEN (Actions provides this automatically).
 * No personal API key required for public reads + committing back from Actions.
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

const USER = process.env.GITHUB_USER || process.env.GITHUB_ACTOR || 'kvnloo';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const SITE_URL = (process.env.SITE_URL || 'https://kvnloo.github.io/boplog').replace(/\/$/, '');
const API = 'https://api.github.com';
const CONCURRENCY = Number(process.env.SYNC_CONCURRENCY || 8);
const FEATURED_LIMIT_DEFAULT = 6;
const OVERRIDES_PATH = path.join(DATA_DIR, 'description-overrides.json');
const DATE_OVERRIDES_PATH = path.join(DATA_DIR, 'date-overrides.json');
const FEATURED_PATH = path.join(DATA_DIR, 'featured.json');
const HIERARCHY_PATH = path.join(DATA_DIR, 'hierarchy.json');
const WEAK_DESC_RE = /^(public repository|fork with commits by me)(\s*·.*)?$/i;
const GENERIC_README_RE = /run and deploy your ai studio app|this template provides a minimal setup|automatically synced with your \[?v0/i;

const LANGUAGE_CATEGORY = {
  Python: 'dev',
  JavaScript: 'dev',
  TypeScript: 'dev',
  Go: 'dev',
  Rust: 'dev',
  Shell: 'dev',
  HTML: 'dev',
  CSS: 'dev',
  Java: 'dev',
  Ruby: 'dev',
  Swift: 'dev',
  Kotlin: 'dev',
  C: 'dev',
  'C++': 'dev',
  'C#': 'dev',
  Jupyter: 'ai',
  Dockerfile: 'dev',
};

function log(...args) {
  console.log('[sync-github]', ...args);
}

function die(message, code = 1) {
  console.error('[sync-github]', message);
  process.exit(code);
}

function isoDay(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function slugify(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'repo';
}

function languageType(language) {
  if (!language) return null;
  const map = {
    Python: 'py',
    JavaScript: 'js',
    TypeScript: 'ts',
    Go: 'go',
    Rust: 'rs',
    Shell: 'sh',
    HTML: 'html',
    CSS: 'css',
    Ruby: 'rb',
    Java: 'java',
  };
  return map[language] || language.toLowerCase().slice(0, 8);
}

async function api(pathname, { allow404 = false } = {}) {
  const url = pathname.startsWith('http') ? pathname : `${API}${pathname}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'boplog-sync',
  };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

  const response = await fetch(url, { headers });
  if (allow404 && response.status === 404) return null;
  if (response.status === 409) return []; // empty repo
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${pathname}: ${body.slice(0, 240)}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function apiPaginate(pathname) {
  const items = [];
  let url = `${API}${pathname}${pathname.includes('?') ? '&' : '?'}per_page=100`;
  while (url) {
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'boplog-sync',
    };
    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${response.status} ${url}: ${body.slice(0, 240)}`);
    }
    const page = await response.json();
    if (Array.isArray(page)) items.push(...page);
    else if (Array.isArray(page.items)) items.push(...page.items);
    else break;

    const link = response.headers.get('link') || '';
    const next = [...link.matchAll(/<([^>]+)>;\s*rel="next"/g)].map((m) => m[1])[0];
    url = next || null;
  }
  return items;
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function run() {
    while (index < items.length) {
      const i = index;
      index += 1;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

/**
 * Collect commits authored by USER. Checks default branch first; for forks
 * (or when default is empty) also walks other branches so feature-branch work
 * like claude-island is not missed.
 */
async function collectAuthoredCommits(repo, { maxMessages = 12, stopOnFirst = false } = {}) {
  const perPage = stopOnFirst ? 1 : Math.min(maxMessages, 30);
  const authorQ = `author=${encodeURIComponent(USER)}&per_page=${perPage}`;
  const messages = [];
  const seenSha = new Set();
  let latestDate = null;

  async function absorb(commits) {
    if (!Array.isArray(commits)) return;
    for (const c of commits) {
      const sha = c.sha;
      if (!sha || seenSha.has(sha)) continue;
      seenSha.add(sha);
      const msg = (c.commit?.message || '').trim();
      const date = c.commit?.author?.date || c.commit?.committer?.date || null;
      if (date && (!latestDate || date > latestDate)) latestDate = date;
      if (msg) messages.push(msg);
      if (stopOnFirst || messages.length >= maxMessages) return;
    }
  }

  const onDefault = await api(
    `/repos/${repo.full_name}/commits?${authorQ}`,
    { allow404: true },
  );
  if (Array.isArray(onDefault)) await absorb(onDefault);

  // Feature-branch work lives off main on many forks (e.g. claude-island).
  const needMore = stopOnFirst ? seenSha.size === 0 : messages.length < maxMessages;
  if (needMore && (repo.fork || seenSha.size === 0)) {
    const branches = await api(
      `/repos/${repo.full_name}/branches?per_page=100`,
      { allow404: true },
    );
    if (Array.isArray(branches)) {
      const defaultBranch = repo.default_branch || 'main';
      const ordered = [
        ...branches.filter((b) => b.name !== defaultBranch),
      ];
      for (const branch of ordered) {
        if (stopOnFirst && seenSha.size > 0) break;
        if (!stopOnFirst && messages.length >= maxMessages) break;
        const commits = await api(
          `/repos/${repo.full_name}/commits?sha=${encodeURIComponent(branch.name)}&${authorQ}`,
          { allow404: true },
        );
        await absorb(commits);
      }
    }
  }

  return {
    found: seenSha.size > 0,
    messages,
    latestDate,
    count: seenSha.size,
  };
}

async function userAuthoredCommit(repo) {
  const { found } = await collectAuthoredCommits(repo, { maxMessages: 1, stopOnFirst: true });
  return found;
}

function normalizeHttps(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (!/^https:\/\//i.test(withScheme)) return null;
  try {
    return new URL(withScheme).href;
  } catch {
    return null;
  }
}

function labelForWebUrl(url, { fromPages = false } = {}) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.endsWith('github.io') || fromPages) return 'docs';
    return 'site';
  } catch {
    return 'site';
  }
}

/**
 * Build ordered links: docs/site first, GitHub last. Primary url prefers web.
 */
async function resolveLinks(repo) {
  const githubUrl = repo.html_url;
  const web = [];
  const seen = new Set();

  function addWeb(url, { fromPages = false } = {}) {
    let href = normalizeHttps(url);
    if (!href) return;
    if (href.includes('github.io') && !href.endsWith('/')) href = `${href}/`;
    const key = href.replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) return;
    if (key.includes('github.com/') && key.includes(String(repo.full_name).toLowerCase())) return;
    seen.add(key);
    web.push({ label: labelForWebUrl(href, { fromPages }), url: href });
  }

  const pages = await api(`/repos/${repo.full_name}/pages`, { allow404: true });
  if (pages && pages.html_url) addWeb(pages.html_url, { fromPages: true });
  if (repo.homepage) addWeb(repo.homepage);

  const links = [
    ...web,
    { label: 'github', url: githubUrl },
  ];

  return { links, primaryUrl: web[0]?.url || githubUrl };
}

/** Turn my commit subjects into a contribution-focused blurb (especially forks). */
function descriptionFromMyCommits(messages, repo) {
  if (!messages?.length) return null;

  const skip = /^(merge\b|wip\b|tmp\b|chore:\s*update implementation|auto-claude:\s*subtask|qa:\s*sign off|co-authored-by:)/i;
  const subjects = [];
  for (const raw of messages) {
    const first = raw.split('\n')[0].trim();
    if (!first || skip.test(first)) continue;
    // Drop empty whatthecommit-style noise
    if (/^https?:\/\//i.test(first) || first.length < 8) continue;
    let s = first
      .replace(/^(feat|fix|docs|refactor|perf|test|chore|style)(\(.+?\))?:\s*/i, '')
      .replace(/^auto-claude:\s*/i, '')
      .trim();
    if (s.length < 8) continue;
    // de-dupe similar
    if (subjects.some((x) => x.toLowerCase() === s.toLowerCase())) continue;
    subjects.push(s);
    if (subjects.length >= 4) break;
  }
  if (!subjects.length) return null;

  const joined = subjects
    .slice(0, 3)
    .map((s, i) => (i === 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s))
    .join('; ');

  if (repo.fork) {
    const parent = repo.parent?.full_name || repo.name;
    return clampDescription(`My work on this fork of ${parent}: ${joined}`);
  }
  return clampDescription(joined);
}

function categoriesFor(repo) {
  const cats = new Set();
  const topics = Array.isArray(repo.topics) ? repo.topics.map((t) => t.toLowerCase()) : [];
  for (const topic of topics) {
    if (['ai', 'ml', 'llm', 'agent', 'agents'].includes(topic)) cats.add('ai');
    else if (['web3', 'crypto', 'blockchain'].includes(topic)) cats.add('web3');
    else if (['art', 'design', 'creative'].includes(topic)) cats.add('art');
    else if (['vc', 'startup', 'venture'].includes(topic)) cats.add('vc');
  }
  if (LANGUAGE_CATEGORY[repo.language]) cats.add(LANGUAGE_CATEGORY[repo.language]);
  if (cats.size === 0) cats.add('dev');
  return [...cats];
}

async function loadDescriptionOverrides() {
  try {
    const raw = JSON.parse(await readFile(OVERRIDES_PATH, 'utf8'));
    const map = new Map();
    for (const [key, value] of Object.entries(raw)) {
      // Metadata keys only (not repo names like "_pm").
      if (key === '_comment' || key.startsWith('__')) continue;
      if (typeof value === 'string' && value.trim()) map.set(key, value.trim());
    }
    return map;
  } catch {
    return new Map();
  }
}

async function loadDateOverrides() {
  try {
    const raw = JSON.parse(await readFile(DATE_OVERRIDES_PATH, 'utf8'));
    const map = new Map();
    for (const [key, value] of Object.entries(raw)) {
      if (key === '_comment' || key.startsWith('__')) continue;
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
        map.set(key, value.trim());
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

function isWeakDescription(text) {
  if (!text || !String(text).trim()) return true;
  return WEAK_DESC_RE.test(String(text).trim());
}

function clampDescription(text, max = 220) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const sliced = clean.slice(0, max - 1);
  const cut = sliced.lastIndexOf(' ');
  return `${(cut > 80 ? sliced.slice(0, cut) : sliced).trim()}…`;
}

function descriptionFromReadme(readme, repoName) {
  if (!readme) return null;
  let text = String(readme)
    .replace(/\r/g, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]*\)/g, (m) => {
      const label = m.match(/^\[([^\]]*)]/);
      return label ? label[1] : ' ';
    })
    .replace(/^\|.*\|$/gm, ' ')
    .replace(/^>\s?/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text || GENERIC_README_RE.test(text)) return null;

  const name = String(repoName || '').replace(/^\./, '');
  const nameRe = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[—\\-–:]?\\s*`, 'i');
  text = text.replace(nameRe, '').trim();

  const sentence = text.split(/(?<=[.!?])\s+/)[0] || text;
  if (sentence.length < 24) {
    const longer = text.slice(0, 200).trim();
    if (longer.length < 24 || GENERIC_README_RE.test(longer)) return null;
    return clampDescription(longer);
  }
  if (GENERIC_README_RE.test(sentence)) return null;
  return clampDescription(sentence);
}

async function fetchReadmeText(fullName) {
  try {
    const headers = {
      Accept: 'application/vnd.github.raw+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'boplog-sync',
    };
    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
    const response = await fetch(`${API}/repos/${fullName}/readme`, { headers });
    if (!response.ok) return null;
    return (await response.text()).slice(0, 8000);
  } catch {
    return null;
  }
}

async function resolveDescription(repo, overrides, authored) {
  // Forks: prioritize my commit subjects / docs over upstream About text.
  // Hand overrides still win when present (contribution-focused blurbs).
  const override = overrides.get(repo.name);

  if (repo.fork) {
    if (override) return { description: clampDescription(override), source: 'override' };

    const fromCommits = descriptionFromMyCommits(authored?.messages || [], repo);
    if (fromCommits) return { description: fromCommits, source: 'commits' };

    const readme = await fetchReadmeText(repo.full_name);
    const fromReadme = descriptionFromReadme(readme, repo.name);
    if (fromReadme) {
      return {
        description: clampDescription(`My work on this fork: ${fromReadme}`),
        source: 'readme',
      };
    }

    return {
      description: `Public fork of ${repo.parent?.full_name || repo.name} with my commits`,
      source: 'fallback',
    };
  }

  if (override) return { description: clampDescription(override), source: 'override' };

  const gh = (repo.description || '').trim();
  if (gh && !isWeakDescription(gh) && gh.length >= 12) {
    return { description: clampDescription(gh), source: 'github' };
  }

  const fromCommits = descriptionFromMyCommits(authored?.messages || [], repo);
  if (fromCommits) return { description: fromCommits, source: 'commits' };

  const readme = await fetchReadmeText(repo.full_name);
  const fromReadme = descriptionFromReadme(readme, repo.name);
  if (fromReadme) return { description: fromReadme, source: 'readme' };

  if (gh && !isWeakDescription(gh)) {
    return { description: clampDescription(gh), source: 'github' };
  }

  const fallback = [
    'Public repository',
    repo.language ? `· ${repo.language}` : null,
  ].filter(Boolean).join(' ');
  return { description: fallback, source: 'fallback' };
}

async function projectFromRepo(repo, overrides, dateOverrides, { featured = false, featuredRank } = {}) {
  // Need parent full_name for fork blurbs
  let parent = repo.parent;
  if (repo.fork && !parent?.full_name) {
    try {
      const detailed = await api(`/repos/${repo.full_name}`, { allow404: true });
      if (detailed?.parent) parent = detailed.parent;
      if (detailed) {
        repo = { ...repo, ...detailed, parent: detailed.parent || parent };
      }
    } catch {
      // keep list payload
    }
  }

  const authored = await collectAuthoredCommits(repo, { maxMessages: 15 });
  const { description, source } = await resolveDescription(repo, overrides, authored);
  const { links, primaryUrl } = await resolveLinks(repo);

  // Prefer latest *my* commit date for forks (feature branch work).
  // Date overrides win when Git history is misleading (cleanup-only pushes).
  const date = dateOverrides.get(repo.name)
    || isoDay(authored.latestDate)
    || isoDay(repo.pushed_at)
    || isoDay(repo.updated_at)
    || isoDay(repo.created_at);

  const types = ['public'];
  const langType = languageType(repo.language);
  if (langType) types.push(langType);
  if (repo.fork) types.push('fork');

  const project = {
    id: slugify(repo.name),
    name: repo.name,
    description,
    date,
    url: primaryUrl,
    types,
    formats: [],
    categories: categoriesFor(repo),
    links,
    stars: repo.stargazers_count || 0,
    fork: Boolean(repo.fork),
    language: repo.language || null,
    homepage: repo.homepage || null,
    topics: Array.isArray(repo.topics) ? repo.topics : [],
    descriptionSource: source,
  };

  if (featured) {
    project.featured = true;
    project.featuredRank = featuredRank;
    project.eyebrow = repo.fork ? 'Fork contribution' : (repo.language || 'Public repo');
  }

  return project;
}

async function loadFeaturedConfig() {
  try {
    const raw = JSON.parse(await readFile(FEATURED_PATH, 'utf8'));
    const limit = Number(raw.limit) > 0 ? Math.min(12, Number(raw.limit)) : FEATURED_LIMIT_DEFAULT;
    const repos = Array.isArray(raw.repos)
      ? raw.repos.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim())
      : [];
    return { limit, repos };
  } catch {
    return { limit: FEATURED_LIMIT_DEFAULT, repos: [] };
  }
}

async function loadHierarchy() {
  try {
    return JSON.parse(await readFile(HIERARCHY_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function applyHierarchy(projects, hierarchy) {
  if (!hierarchy || !Array.isArray(hierarchy.products)) return projects;
  const company = hierarchy.company || { id: 'zer0', name: 'zer0' };
  const portfolios = Object.fromEntries((hierarchy.portfolios || []).map((p) => [p.id, p]));
  const defaultPf = hierarchy.defaultPortfolio || 'deeptech';
  const defaultPd = hierarchy.defaultProduct || 'lab';
  const byName = new Map();
  for (const product of hierarchy.products) {
    for (const name of product.projects || []) {
      byName.set(name, product);
      byName.set(String(name).toLowerCase(), product);
      byName.set(slugify(name), product);
    }
  }
  const defaultProduct = hierarchy.products.find((p) => p.id === defaultPd) || hierarchy.products.at(-1);

  return projects.map((project) => {
    const product = byName.get(project.name)
      || byName.get(project.id)
      || byName.get(slugify(project.name))
      || defaultProduct;
    const portfolioId = product?.portfolio || defaultPf;
    const portfolio = portfolios[portfolioId] || { id: portfolioId, name: portfolioId };
    return {
      ...project,
      company: company.id,
      companyName: company.name,
      portfolio: portfolio.id,
      portfolioName: portfolio.name,
      product: product?.id || defaultPd,
      productName: product?.name || defaultPd,
    };
  });
}

function pickFeatured(projects, featuredConfig) {
  const limit = featuredConfig?.limit || FEATURED_LIMIT_DEFAULT;
  const byName = new Map(projects.map((p) => [p.name, p]));
  const byId = new Map(projects.map((p) => [p.id, p]));
  const picked = [];
  const seen = new Set();

  for (const name of featuredConfig?.repos || []) {
    if (picked.length >= limit) break;
    const project = byName.get(name) || byId.get(slugify(name));
    if (!project || seen.has(project.id)) continue;
    seen.add(project.id);
    picked.push(project.id);
  }

  if (picked.length < limit) {
    const ranked = [...projects].sort((a, b) => {
      if ((b.stars || 0) !== (a.stars || 0)) return (b.stars || 0) - (a.stars || 0);
      return b.date.localeCompare(a.date);
    });
    for (const project of ranked) {
      if (picked.length >= limit) break;
      if (seen.has(project.id)) continue;
      seen.add(project.id);
      picked.push(project.id);
    }
  }

  return picked;
}

function stripInternalFields(project) {
  const {
    stars, fork, language, homepage, topics, descriptionSource, ...rest
  } = project;
  return rest;
}

async function writeYearFiles(projects, featuredLimit = FEATURED_LIMIT_DEFAULT) {
  const byYear = new Map();
  for (const project of projects) {
    const year = project.date.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(project);
  }

  const existing = await readdir(DATA_DIR).catch(() => []);
  for (const file of existing) {
    if (/^projects-\d{4}\.json$/.test(file)) {
      await rm(path.join(DATA_DIR, file));
    }
  }

  const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a));
  const files = [];
  for (const year of years) {
    const list = byYear.get(year).sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
    const filename = `projects-${year}.json`;
    files.push(filename);
    await writeFile(
      path.join(DATA_DIR, filename),
      `${JSON.stringify({ projects: list.map(stripInternalFields) }, null, 2)}\n`,
      'utf8',
    );
  }

  const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const manifest = {
    generatedAt,
    source: `GitHub public repos for ${USER} (authored commits only; forks without commits excluded)`,
    featuredLimit,
    user: USER,
    files,
  };
  await writeFile(path.join(DATA_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { manifest, years, files };
}

function escapeXml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

async function writeFeed(projects, generatedAt) {
  const latest = [...projects].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 25);
  const entries = latest.map((p) => {
    const cats = (p.categories || []).map((c) => `<category term="${escapeXml(c)}"/>`).join('');
    return `  <entry>
    <title>${escapeXml(p.name)}</title>
    <id>${escapeXml(p.url)}</id>
    <link href="${escapeXml(p.url)}"/>
    <published>${p.date}T00:00:00Z</published>
    <updated>${p.date}T00:00:00Z</updated>
    ${cats}
    <summary>${escapeXml(p.description)}</summary>
  </entry>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Kevin Rajan — Build Log</title>
  <subtitle>Public repositories I have committed to.</subtitle>
  <id>${escapeXml(SITE_URL)}/</id>
  <link href="${escapeXml(SITE_URL)}/" rel="alternate"/>
  <link href="${escapeXml(SITE_URL)}/feed.xml" rel="self" type="application/atom+xml"/>
  <updated>${generatedAt}</updated>
  <author><name>Kevin Rajan</name><uri>https://github.com/${escapeXml(USER)}</uri></author>
${entries}
</feed>
`;
  await writeFile(path.join(ROOT, 'feed.xml'), xml, 'utf8');
}

async function writeSitemap(generatedAt) {
  const day = generatedAt.slice(0, 10);
  const urls = [
    `${SITE_URL}/`,
    `${SITE_URL}/developers/`,
    `${SITE_URL}/agents.md`,
    `${SITE_URL}/llms.txt`,
    `${SITE_URL}/openapi.json`,
    `${SITE_URL}/feed.xml`,
    `${SITE_URL}/data/manifest.json`,
  ];
  const body = urls.map((loc) => `  <url><loc>${escapeXml(loc)}</loc><lastmod>${day}</lastmod><changefreq>hourly</changefreq><priority>0.8</priority></url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
  await writeFile(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');
}

async function writeLlms(projects, generatedAt) {
  const featured = projects.filter((p) => p.featured).sort((a, b) => (a.featuredRank || 99) - (b.featuredRank || 99));
  const years = [...new Set(projects.map((p) => p.date.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
  const featuredBlock = featured.map((p) => `- [${p.name}](${p.url}): ${p.description}`).join('\n');
  const yearLinks = years.map((y) => `- [${y} projects](${SITE_URL}/data/projects-${y}.json)`).join('\n');

  const text = `# Kevin Rajan — Build Log

> A public, chronological archive of repositories Kevin Rajan (\`${USER}\`) has committed to on GitHub.

Canonical site: ${SITE_URL}/
Author: Kevin Rajan
GitHub: https://github.com/${USER}
Language: English
Public project count: ${projects.length}
Coverage: ${years.at(-1) || 'n/a'}–${years[0] || 'n/a'}
Last data refresh: ${generatedAt.slice(0, 10)}

## Start here

- [Build log](${SITE_URL}/): Human-readable site with featured work and the chronological archive.
- [Developer access](${SITE_URL}/developers/): Free static API, CLI, and local MCP instructions.
- [Agent usage guide](${SITE_URL}/agents.md): When to use this archive and how to interpret its records.
- [OpenAPI](${SITE_URL}/openapi.json): Read-only OpenAPI 3.1 description; no authentication required.
- [Project data manifest](${SITE_URL}/data/manifest.json): Lists all year-partitioned public JSON files.
- [Atom feed](${SITE_URL}/feed.xml): Latest public projects.
- [Sitemap](${SITE_URL}/sitemap.xml): Canonical discovery URLs.

## When agents should use this site

Use this site when a user asks about Kevin Rajan's / ${USER}'s public GitHub builds and repositories they have actually committed to. Prefer exact fields from the public JSON records. Do not infer private work, stars-only forks, or unpublished projects.

## Free tool access

- CLI: \`boplog latest 5\`, \`boplog search <query>\`, \`boplog topic dev\`, or \`boplog --json get <id>\`.
- CLI source: ${SITE_URL}/boplog
- Local stdio MCP server: ${SITE_URL}/mcp/boplog_mcp.py
- MCP discovery: ${SITE_URL}/.well-known/mcp
- Agent capability discovery: ${SITE_URL}/.well-known/agent-skills

The CLI and MCP server are read-only, dependency-free Python programs. They require no account or API key and query only the public static archive.

## Featured work

${featuredBlock || '- (none yet)'}

## Year files

${yearLinks}

## Links

- [GitHub profile](https://github.com/${USER})
- [This repository](https://github.com/${USER}/boplog)
`;
  await writeFile(path.join(ROOT, 'llms.txt'), text, 'utf8');
}

async function main() {
  if (!TOKEN) {
    log('warning: no GITHUB_TOKEN/GH_TOKEN — unauthenticated (60 req/hr). Prefer Actions token.');
  } else {
    log('using authenticated GitHub API token');
  }
  log(`user=${USER} site=${SITE_URL}`);

  await mkdir(DATA_DIR, { recursive: true });
  const overrides = await loadDescriptionOverrides();
  const dateOverrides = await loadDateOverrides();
  const featuredConfig = await loadFeaturedConfig();
  const hierarchy = await loadHierarchy();
  log(`description overrides: ${overrides.size}`);
  log(`date overrides: ${dateOverrides.size}`);
  log(`hierarchy products: ${hierarchy?.products?.length || 0}`);
  log(`featured pin list: ${featuredConfig.repos.join(', ') || '(none)'} (limit ${featuredConfig.limit})`);

  log('listing public repos…');
  // type=owner = repos the user owns (includes forks they own)
  const repos = await apiPaginate(`/users/${encodeURIComponent(USER)}/repos?type=owner&sort=pushed&direction=desc`);
  const publicRepos = repos.filter((r) => !r.private);
  log(`public owned repos: ${publicRepos.length} (${publicRepos.filter((r) => r.fork).length} forks)`);

  const originals = publicRepos.filter((r) => !r.fork);
  const forks = publicRepos.filter((r) => r.fork);

  // Don't deep-scan all 320 archive forks. Only forks that were pushed after
  // creation (you actually pushed something) or already have a hand override.
  const touchedForks = forks.filter((repo) => {
    if (overrides.has(repo.name)) return true;
    const pushed = Date.parse(repo.pushed_at || 0);
    const created = Date.parse(repo.created_at || 0);
    return Number.isFinite(pushed) && Number.isFinite(created) && pushed - created > 60_000;
  });
  log(`fork candidates (touched after fork / override): ${touchedForks.length} of ${forks.length}`);

  log(`checking authorship on ${touchedForks.length} fork candidates (incl. non-default branches)…`);
  const forkFlags = await mapPool(touchedForks, CONCURRENCY, async (repo) => {
    try {
      const ok = await userAuthoredCommit(repo);
      return ok ? repo : null;
    } catch (error) {
      log(`skip ${repo.full_name}: ${error.message}`);
      return null;
    }
  });
  const authoredForks = forkFlags.filter(Boolean);
  log(`forks with my commits: ${authoredForks.length}`);

  log(`checking authorship on ${originals.length} original repos…`);
  const originalFlags = await mapPool(originals, CONCURRENCY, async (repo) => {
    try {
      const ok = await userAuthoredCommit(repo);
      return ok ? repo : null;
    } catch (error) {
      log(`skip ${repo.full_name}: ${error.message}`);
      return null;
    }
  });
  const authoredOriginals = originalFlags.filter(Boolean);
  log(`originals with my commits: ${authoredOriginals.length}`);

  const selected = [...authoredOriginals, ...authoredForks];
  if (!selected.length) die('no repositories with authored commits found');

  log(`resolving descriptions + docs/pages links for ${selected.length} repos…`);
  let projects = await mapPool(
    selected,
    Math.min(CONCURRENCY, 6),
    (repo) => projectFromRepo(repo, overrides, dateOverrides),
  );
  // De-dupe by id (unlikely)
  const seen = new Set();
  projects = projects.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  projects = applyHierarchy(projects, hierarchy);

  const featuredOrder = pickFeatured(projects, featuredConfig);
  const featuredIds = new Set(featuredOrder);
  projects = projects.map((p) => {
    if (!featuredIds.has(p.id)) return p;
    const rank = featuredOrder.indexOf(p.id) + 1;
    return {
      ...p,
      featured: true,
      featuredRank: rank,
      eyebrow: p.fork ? 'Fork contribution' : (p.language || 'Public repo'),
    };
  });

  projects.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));

  const sources = projects.reduce((acc, p) => {
    acc[p.descriptionSource] = (acc[p.descriptionSource] || 0) + 1;
    return acc;
  }, {});
  log('description sources:', JSON.stringify(sources));

  const { manifest } = await writeYearFiles(projects, featuredConfig.limit);
  await writeFeed(projects, manifest.generatedAt);
  await writeSitemap(manifest.generatedAt);
  await writeLlms(projects, manifest.generatedAt);

  log(`wrote ${projects.length} projects across ${manifest.files.length} year files`);
  log(`featured: ${projects.filter((p) => p.featured).map((p) => p.name).join(', ')}`);
  log(`generatedAt=${manifest.generatedAt}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
