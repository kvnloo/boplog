import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const scopes = JSON.parse(
  await readFile(new URL('../data/oss-scopes.json', import.meta.url), 'utf8'),
);

test('selected communities include current 2026 contribution communities', () => {
  const repositories = new Set(scopes.groups.flatMap((group) => group.repositories));

  for (const repository of [
    'noctalia-dev/noctalia',
    'can1357/oh-my-pi',
    'Untrivial-ai/agent-orchestrator',
    'abhigyanpatwari/GitNexus',
    'xt4d/GameBlocks',
  ]) {
    assert.ok(repositories.has(repository), `missing selected community: ${repository}`);
  }
});
