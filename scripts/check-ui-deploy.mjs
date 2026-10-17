#!/usr/bin/env node
// A Pages deployment is only complete once the actual public assets match
// this commit, not merely when GitHub Actions marks upload/deploy successful.
import { readFile } from 'node:fs/promises';

const base = process.env.PAGES_URL?.replace(/\/$/, '');
if (!base || !/^https:\/\//.test(base)) throw new Error('PAGES_URL is required');
const paths = ['index.html', 'app.js', 'styles.css'];
const expected = await Promise.all(paths.map((name) =>
  readFile(new URL('../' + name, import.meta.url), 'utf8')));

for (let attempt = 1; attempt <= 10; attempt += 1) {
  try {
    for (let i = 0; i < paths.length; i += 1) {
      const url = base + '/' + paths[i] + '?deploy=' + encodeURIComponent(process.env.GITHUB_SHA || Date.now());
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(paths[i] + ' HTTP ' + response.status);
      const published = await response.text();
      if (published !== expected[i]) {
        throw new Error(paths[i] + ' does not match the checked-out release');
      }
    }
    console.log('Live Boplog UI matches published index.html, app.js and styles.css');
    process.exit(0);
  } catch (error) {
    console.warn('UI deployment check ' + attempt + '/10: ' + error.message);
    if (attempt === 10) throw error;
    await new Promise((resolve) => setTimeout(resolve, 6_000));
  }
}
