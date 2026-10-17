import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = (name) => readFile(new URL('../.github/workflows/' + name, import.meta.url), 'utf8');
const collector = () => readFile(new URL('../scripts/collect-oss-contributions.mjs', import.meta.url), 'utf8');

test('production sync runs both collectors, publishes Pages, and checks live freshness', async () => {
  const source = await workflow('sync-github.yml');
  assert.match(source, /schedule:/);
  assert.match(source, /workflow_dispatch:/);
  assert.match(source, /branches: \[main\]/);
  assert.match(source, /scripts\/wait-for-budget\.mjs/);
  assert.match(source, /scripts\/sync-github\.mjs/);
  assert.match(source, /scripts\/collect-oss-contributions\.mjs/);
  assert.match(source, /actions\/deploy-pages@v4/);
  assert.match(source, /scripts\/check-live-publish\.mjs/);
  assert.match(source, /pages: write/);
  assert.match(source, /id-token: write/);
  assert.match(source, /  deploy:\n    name: Deploy and verify published site\n    needs: sync/);
  assert.doesNotMatch(source.split('  deploy:')[0].split('  sync:')[1], /    environment:/);
});

test('PR validation is offline by default so pushes do not exhaust installation quota', async () => {
  const source = await workflow('sync-smoke.yml');
  assert.match(source, /Validate code and checked-in evidence/);
  assert.match(source, /npm run check/);
  assert.match(source, /workflow_dispatch:/);
  for (const label of ['Run project collector without publishing', 'Run OSS collector without publishing']) {
    assert.ok(source.includes('- name: ' + label + "\n        if: github.event_name == 'workflow_dispatch'"));
  }
});

test('merged PRs are resolved in batched GraphQL rather than per-PR REST requests', async () => {
  const source = await collector();
  assert.match(source, /collectMergedAt\(mergedQuery, request\)/);
  assert.match(source, /exactMergedAt\(item, mergedDates\)/);
  assert.doesNotMatch(source, /\/pulls\/\$\{item\.number\}/);
});

test('featured public forks are included independently of recent activity hints', async () => {
  const source = await readFile(new URL('../scripts/sync-github.mjs', import.meta.url), 'utf8');
  assert.match(source, /featuredForkNames = new Set/);
  assert.match(source, /featuredConfig\.repos\.map/);
  assert.match(source, /featuredForkNames\.has\(repo\.name\.toLowerCase\(\)\)/);
  assert.match(source, /const selected = \[\.\.\.originals, \.\.\.selectedForks\]/);
});

test('public OSS scope registry leads with seven ongoing collaborations and no private forks', async () => {
  const scopes = JSON.parse(await readFile(new URL('../data/oss-scopes.json', import.meta.url), 'utf8'));
  const snapshot = JSON.parse(await readFile(new URL('../data/oss-contributions.json', import.meta.url), 'utf8'));
  const expected = [
    'NousResearch/hermes-agent', 'can1357/oh-my-pi',
    'bilawalsidhu/gods-eye-view', 'trycua/cua',
    'ryanbr/noop', 'noctalia-dev/noctalia', 'hurttlocker/o8',
  ];
  assert.deepEqual(scopes.groups.slice(0, 7).map((g) => g.repositories[0]), expected);
  assert.equal(scopes.groups.length, 28);
  assert.deepEqual(snapshot.selectedGroups.map((g) => g.id), scopes.groups.map((g) => g.id));
  const forbidden = ['kvnloo/oss-factory', 'kvnloo/aural', 'AgentWebPro/agentweb'];
  assert.ok(scopes.groups.every((g) => g.repositories.every((repo) => !forbidden.includes(repo))));
  assert.match(await workflow('sync-github.yml'), /'data\/oss-scopes\.json'/);
});
