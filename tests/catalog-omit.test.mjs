import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('catalog omit keeps factory dumps and empty placeholders off the project grid', async () => {
  const omit = JSON.parse(await readFile(new URL('../data/catalog-omit.json', import.meta.url), 'utf8'));
  const names = new Set(omit.names);
  assert.equal(omit.prefixes.includes('factory-'), true);
  for (const name of [
    'factory-ryanbr-noop',
    'noctalia',
    'hermes-agent',
    'Telegram-iOS-empty-placeholder',
  ]) {
    assert.equal(names.has(name), true, `missing omit: ${name}`);
  }
  for (const keep of ['ace', 'blueprint', 'aodl', 'evolve', '.files', 'boplog']) {
    assert.equal(names.has(keep), false, `must not omit featured/product: ${keep}`);
  }
});

test('year files keep omitted factory dumps off the grid and include catch-up originals', async () => {
  const omit = JSON.parse(await readFile(new URL('../data/catalog-omit.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(await readFile(new URL('../data/manifest.json', import.meta.url), 'utf8'));
  const names = new Set();
  for (const file of manifest.files || []) {
    const chunk = JSON.parse(await readFile(new URL(`../data/${file}`, import.meta.url), 'utf8'));
    for (const project of chunk.projects || []) names.add(project.name);
  }
  for (const blocked of omit.names) {
    assert.equal(names.has(blocked), false, `year files must not include ${blocked}`);
  }
  for (const keep of ['aodl', 'dash', 'kerdoios', 'evolution-lab', 'verified-oss-loop', 'frontier-kb', 'openavatar']) {
    assert.equal(names.has(keep), true, `year files must include ${keep}`);
  }
});
