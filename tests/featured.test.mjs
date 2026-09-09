import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dataDir = new URL('../data/', import.meta.url);
const featured = JSON.parse(await readFile(new URL('featured.json', dataDir), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('manifest.json', dataDir), 'utf8'));
const projects = (
  await Promise.all((manifest.files || []).map(async (file) => {
    const chunk = JSON.parse(await readFile(new URL(file, dataDir), 'utf8'));
    return chunk.projects || [];
  }))
).flat();

const CURRENT_PUBLIC = [
  'evolve',
  'ace',
  'portfolio',
  'tmux-agent-fleet',
  '.files',
  'boplog',
];

test('featured.json pins six current public repos and drops AudioEngine', () => {
  assert.equal(featured.limit, 6);
  assert.deepEqual(featured.repos, CURRENT_PUBLIC);
  assert.equal(new Set(featured.repos).size, 6);
  assert.ok(!featured.repos.includes('AudioEngine'));
});

test('snapshot featured ranks follow the pin list; AudioEngine stays in the archive unpinned', () => {
  const byName = new Map(projects.map((project) => [project.name, project]));
  for (const name of CURRENT_PUBLIC) {
    assert.ok(byName.has(name), `pin missing from archive: ${name}`);
  }

  const audio = byName.get('AudioEngine');
  assert.ok(audio, 'AudioEngine must remain in the archive');
  assert.notEqual(audio.featured, true);
  assert.equal(audio.featuredRank, undefined);

  const ranked = projects
    .filter((project) => project.featured)
    .sort((a, b) => (a.featuredRank || 99) - (b.featuredRank || 99))
    .map((project) => project.name);
  assert.deepEqual(ranked, CURRENT_PUBLIC);
  ranked.forEach((name, index) => {
    assert.equal(byName.get(name).featuredRank, index + 1);
  });
});
