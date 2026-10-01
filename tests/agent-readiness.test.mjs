import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

function visibleText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

test('publishes truthful agent discovery files with subpath-safe canonical URLs', async () => {
  const [llms, full, agentText, agents] = await Promise.all([
    read('llms.txt'),
    read('llms-full.txt'),
    read('.well-known/agent.json'),
    read('agents.md'),
  ]);
  const agent = JSON.parse(agentText);
  assert.match(llms, /## When agents should use this site/);
  assert.match(llms, /https:\/\/kvnloo\.github\.io\/boplog\/llms-full\.txt/);
  assert.match(full, /The site is deployed at the GitHub Pages project subpath `\/boplog\/`/);
  assert.match(full, /Do not fabricate a physical address or phone number/);
  assert.equal(agent.url, 'https://kvnloo.github.io/boplog/');
  assert.equal(agent.llmsFull, 'https://kvnloo.github.io/boplog/llms-full.txt');
  assert.ok(agent.whenToUse.length >= 3);
  assert.match(agents, /## How agents should use this archive/);
});

test('trust pages are substantive and do not fabricate address or phone data', async () => {
  for (const path of ['about/index.html', 'contact/index.html', 'privacy/index.html']) {
    const html = await read(path);
    assert.ok(visibleText(html).length >= 500, `${path} must expose at least 500 visible characters`);
    assert.match(html, /<link rel="canonical" href="https:\/\/kvnloo\.github\.io\/boplog\//);
    assert.match(html, /<meta property="og:image"/);
  }
  const contact = await read('contact/index.html');
  assert.match(contact, /does not publish a business street address or phone number/);
  assert.doesNotMatch(contact, /PostalAddress|streetAddress|telephone/);
});

test('sitemap covers public HTML, markdown mirrors, and agent discovery surfaces', async () => {
  const sitemap = await read('sitemap.xml');
  const required = [
    '/', '/about/', '/contact/', '/privacy/', '/developers/', '/topics/',
    '/about.md', '/contact.md', '/privacy.md', '/agents.md', '/llms.txt',
    '/llms-full.txt', '/.well-known/agent.json', '/.well-known/agent-skills',
    '/.well-known/mcp', '/openapi.json', '/feed.xml', '/data/manifest.json',
  ];
  for (const path of required) {
    assert.match(sitemap, new RegExp(`<loc>https://kvnloo\\.github\\.io/boplog${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>`));
  }
  for (const topic of ['3d-web', 'agent-orchestration', 'ai-devtools', 'ai-sdlc', 'automation', 'build-in-public', 'digital-twin', 'health-bci', 'professional']) {
    assert.match(sitemap, new RegExp(`/topics/${topic}\\.html</loc>`));
  }
});

test('homepage exposes complete metadata and discovery links in raw HTML', async () => {
  const html = await read('index.html');
  for (const signal of [
    '<html lang="en">',
    '<link rel="canonical" href="https://kvnloo.github.io/boplog/">',
    '<meta property="og:type" content="website">',
    '<meta property="og:image" content="https://kvnloo.github.io/boplog/favicon.svg">',
    '<link rel="alternate" type="text/plain" href="./llms.txt"',
    '<link rel="alternate" type="text/plain" href="./llms-full.txt"',
  ]) assert.ok(html.includes(signal), `missing ${signal}`);
  const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(jsonLd, 'homepage must contain JSON-LD');
  const graph = JSON.parse(jsonLd[1])['@graph'];
  assert.ok(graph.some((item) => item['@type'] === 'Person'));
  assert.ok(graph.some((item) => item['@type'] === 'Organization' && item.contactPoint?.email === 'kevinsrajan@gmail.com'));
  assert.ok(visibleText(html).length >= 500, 'raw HTML must contain substantive non-script text');
});

test('custom 404 gives subpath-safe recovery without pretending success', async () => {
  const html = await read('404.html');
  for (const path of ['/boplog/llms.txt', '/boplog/llms-full.txt', '/boplog/sitemap.xml', '/boplog/agents.md', '/boplog/data/manifest.json']) {
    assert.ok(html.includes(`href="${path}"`));
  }
  assert.match(html, /HTTP status 404/);
});
