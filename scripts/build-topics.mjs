#!/usr/bin/env node
/**
 * Generate static topic hub pages under topics/ from taxonomy + project data.
 * Also refreshes sitemap topic URLs and a topics/index.html.
 *
 * Extractability: first paragraph is an answer-first lead (domain.answer or
 * domain.description) so agents can cite a concrete sentence + URLs.
 */
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const TOPICS = path.join(ROOT, 'topics');
const SITE = 'https://kvnloo.github.io/boplog';

function esc(s = '') {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function pageShell({ title, description, canonical, body, build, jsonLdExtra }) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url: canonical,
    isPartOf: { '@type': 'WebSite', url: `${SITE}/`, name: 'Kevin Rajan — Build Log' },
    ...(jsonLdExtra || {}),
  };
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="boplog-build" content="${esc(build)}">
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="index,follow">
  <title>${esc(title)}</title>
  <link rel="canonical" href="${esc(canonical)}">
  <link rel="stylesheet" href="../styles.css?v=${esc(build)}">
  <script type="application/ld+json">
  ${JSON.stringify(ld)}
  </script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <main class="shell topic-page" id="main">
    <p class="intro__company"><a href="../">← boplog</a> · topics</p>
    ${body}
  </main>
  <footer class="shell">
    <span>© Kevin Rajan</span>
    <a href="../">build log</a>
    <a href="../llms.txt">llms.txt</a>
  </footer>
</body>
</html>
`;
}

async function loadProjects() {
  const files = (await readdir(DATA)).filter((f) => /^projects-\d{4}\.json$/.test(f));
  const all = [];
  for (const f of files) {
    const chunk = JSON.parse(await readFile(path.join(DATA, f), 'utf8'));
    all.push(...(chunk.projects || []));
  }
  return all;
}

function topProjectLinks(matched, limit = 4) {
  return matched.slice(0, limit).map((p) => {
    const gh = (p.links || []).find((l) => /github\.com/i.test(l.url || ''));
    const primary = p.url || gh?.url || '';
    return { name: p.name, url: primary, description: p.description || '' };
  }).filter((x) => x.url);
}

async function main() {
  const build = new Date().toISOString().slice(0, 10).replaceAll('-', '') + '.geo';
  const taxonomy = JSON.parse(await readFile(path.join(DATA, 'taxonomy.json'), 'utf8'));
  const projects = await loadProjects();
  await mkdir(TOPICS, { recursive: true });

  const domains = taxonomy.domains || [];
  const indexItems = [];

  for (const domain of domains) {
    const matched = projects
      .filter((p) => (p.domains || []).includes(domain.id))
      .sort((a, b) => {
        // Prefer featured / named products first so cite lines surface evolve, ace, etc.
        const score = (x) => (x.featured ? 2 : 0) + (x.product ? 1 : 0);
        const d = score(b) - score(a);
        if (d) return d;
        return (b.date || '').localeCompare(a.date || '');
      });

    const list = matched.map((p) => {
      const langs = (p.languages || []).join(', ');
      const stack = (p.stack || []).join(', ');
      const meta = [langs, stack].filter(Boolean).join(' · ');
      const gh = (p.links || []).find((l) => /github\.com/i.test(l.url || ''));
      const extra = gh && gh.url !== p.url
        ? ` <a href="${esc(gh.url)}">source</a>`
        : '';
      return `<li class="topic-page__item">
  <a href="${esc(p.url)}"><strong>${esc(p.name)}</strong></a>${extra}
  ${p.date ? `<time datetime="${esc(p.date)}">${esc(p.date)}</time>` : ''}
  <p>${esc(p.description || '')}</p>
  ${meta ? `<p class="topic-page__meta">${esc(meta)}</p>` : ''}
</li>`;
    }).join('\n');

    const lead = (domain.answer || domain.description || '').trim();
    const tops = topProjectLinks(matched);
    const citeLine = tops.length
      ? `Primary citable projects: ${tops.map((t) => `${t.name} (${t.url})`).join('; ')}.`
      : '';

    const title = `${domain.title} — kevin rajan / boplog`;
    const description = `${lead.slice(0, 220)}${lead.length > 220 ? '…' : ''} Public work by Kevin Rajan (kvnloo) tagged ${domain.id}.`;
    const canonical = `${SITE}/topics/${domain.id}.html`;
    const body = `
    <h1>${esc(domain.title)}</h1>
    <p class="intro__lede">${esc(lead)}</p>
    <p class="intro__body">${esc(domain.description)} Public work by kevin rajan (kvnloo) under zer0. Code is the great equalizer; the goal is automating humanitarian causes so more important actions need no thought. This page lists repos tagged <code>${esc(domain.id)}</code>. Canonical hub: <a href="${esc(canonical)}">${esc(canonical)}</a>. ${esc(citeLine)}</p>
    <p class="topic-page__count">${matched.length} project${matched.length === 1 ? '' : 's'}</p>
    <ul class="topic-page__list">
${list || '<li>no public projects tagged yet.</li>'}
    </ul>
    <p class="topic-page__intents"><strong>related intents:</strong> ${esc((domain.intents || []).join(' · '))}</p>
`;
    await writeFile(
      path.join(TOPICS, `${domain.id}.html`),
      pageShell({
        title,
        description,
        canonical,
        body,
        build,
        jsonLdExtra: tops.length
          ? {
              about: tops.map((t) => ({
                '@type': 'SoftwareSourceCode',
                name: t.name,
                url: t.url,
                description: t.description,
              })),
            }
          : undefined,
      }),
      'utf8',
    );
    indexItems.push({ domain, count: matched.length, lead });
  }

  const indexBody = `
    <h1>topics</h1>
    <p class="intro__lede">Discovery hubs for open-source multi-agent frameworks (AI SDLC), agent orchestration, digital twins, automation systems, and related public work by kevin rajan (kvnloo).</p>
    <ul class="topic-page__list topic-page__list--index">
${indexItems.map(({ domain, count, lead }) => `      <li><a href="./${esc(domain.id)}.html"><strong>${esc(domain.title)}</strong></a> · ${count}<br><span class="topic-page__meta">${esc(lead || domain.description)}</span></li>`).join('\n')}
    </ul>
`;
  await writeFile(
    path.join(TOPICS, 'index.html'),
    pageShell({
      title: 'topics — kevin rajan / boplog',
      description: 'Topic hubs for Kevin Rajan public projects: AI SDLC / multi-agent frameworks, digital twins, agent orchestration, automation, build-in-public archives.',
      canonical: `${SITE}/topics/`,
      body: indexBody,
      build,
    }),
    'utf8',
  );

  // Merge topic URLs into sitemap
  let sitemap = await readFile(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const topicUrls = [
    `${SITE}/topics/`,
    ...domains.map((d) => `${SITE}/topics/${d.id}.html`),
  ];
  for (const url of topicUrls) {
    if (!sitemap.includes(url)) {
      sitemap = sitemap.replace(
        '</urlset>',
        `  <url><loc>${url}</loc><changefreq>weekly</changefreq></url>\n</urlset>`,
      );
    }
  }
  await writeFile(path.join(ROOT, 'sitemap.xml'), sitemap, 'utf8');

  console.log(`built ${domains.length} topic pages + index`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
