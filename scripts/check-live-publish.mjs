#!/usr/bin/env node
// Publication gate: a successful data commit is not proof the live Pages site
// updated. Compare the deployed files against the exact regenerated snapshot.
import { readFile } from 'node:fs/promises';

const site = process.env.PAGES_URL?.replace(/\/$/, '');
if (!site || !/^https:\/\//.test(site)) {
  console.error('PAGES_URL is required for live publication verification.');
  process.exit(2);
}

const expected = await Promise.all(
  ['manifest.json', 'oss-contributions.json'].map(async (name) =>
    JSON.parse(await readFile(new URL('../data/' + name, import.meta.url), 'utf8')),
  ),
);

const now = Date.now();
for (const data of expected) {
  const date = Date.parse(data.generatedAt || '');
  if (!Number.isFinite(date) || date > now + 120_000 || now - date > 36 * 3_600_000) {
    throw new Error('Refusing to verify an old or invalid generatedAt: ' + data.generatedAt);
  }
}

let lastError = null;
for (let attempt = 1; attempt <= 8; attempt += 1) {
  try {
    const published = await Promise.all(
      ['manifest.json', 'oss-contributions.json'].map(async (name) => {
        const url = site + '/data/' + name + '?boplog_verify=' + encodeURIComponent(expected[0].generatedAt);
        const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error(name + ' HTTP ' + response.status);
        return response.json();
      }),
    );
    for (let i = 0; i < expected.length; i += 1) {
      if (published[i].generatedAt !== expected[i].generatedAt) {
        throw new Error((i === 0 ? 'projects' : 'OSS') + ' published=' + published[i].generatedAt + ' expected=' + expected[i].generatedAt);
      }
    }
    const home = await fetch(site + '/?boplog_verify=' + encodeURIComponent(expected[0].generatedAt), {
      cache: 'no-store', signal: AbortSignal.timeout(15_000),
    });
    if (!home.ok) throw new Error('Homepage HTTP ' + home.status);
    console.log('Live Pages verified at ' + site);
    console.log('Projects: ' + expected[0].generatedAt);
    console.log('OSS: ' + expected[1].generatedAt);
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.warn('Pages visibility check ' + attempt + '/8: ' + error.message);
    if (attempt < 8) await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}

console.error('Pages failed to expose the published snapshot: ' + lastError.message);
process.exit(1);
