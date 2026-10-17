import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (file) => readFile(new URL('../' + file, import.meta.url), 'utf8');

test('ledger is short by default on both layouts, including when filters are active', async () => {
  const js = await source('app.js');
  assert.match(js, /oss: \{ desktop: 6, mobile: 4 \}/);
  assert.match(js, /return section === 'builds' && activeFilterCount\(\) > 0/);
  assert.match(js, /const visible = isDisclosureExpanded\('oss'\) \? records : records\.slice\(0, previewLimit\('oss'\)\)/);
  assert.doesNotMatch(js, /section === 'oss' && hasOssFilters\(\)/);
  assert.match(js, /state\.disclosure\.oss = params\.get\('oss_rows'\) === 'all'/);
});

test('sticky accessible ledger button sits above long content and collapse returns to it', async () => {
  const html = await source('index.html');
  const css = await source('styles.css');
  const js = await source('app.js');
  const head = html.indexOf('id="oss-ledger-head"');
  const button = html.indexOf('data-disclosure="oss"');
  const ledger = html.indexOf('id="oss-ledger"');
  assert.ok(head >= 0 && button > head && ledger > button);
  assert.match(html, /data-disclosure="oss" aria-controls="oss-ledger" aria-expanded="false"/);
  assert.match(css, /\.oss__ledger-head \{ position: sticky;/);
  assert.match(css, /\.oss__ledger-head \[data-disclosure\]:focus-visible/);
  assert.match(js, /document\.querySelector\('#oss-ledger-head'\)\?\.scrollIntoView/);
  assert.match(js, /button\.focus\(\{ preventScroll: true \}\)/);
});

test('factory relay displays verifiable public snapshot figures without claiming worker telemetry', async () => {
  const html = await source('index.html');
  const css = await source('styles.css');
  const js = await source('app.js');
  const lab = await source('dev/index.html');
  assert.match(lab, /agents online strip/);
  assert.match(html, /id="factory-pulse"[^>]*data-ready="false"/);
  assert.match(html, /id="factory-snapshot"/);
  assert.match(html, /id="factory-metrics" aria-live="polite"/);
  assert.match(js, /mergedUpstreamPullRequests/);
  assert.match(js, /openReadyUpstreamPullRequests/);
  assert.match(js, /distinctUpstreamCommunities/);
  assert.match(js, /elements\.factoryPulse\.dataset\.ready = 'true'/);
  assert.match(css, /@keyframes factory-relay/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(js, /IntersectionObserver/);
  assert.match(js, /document\.addEventListener\('visibilitychange', update\)/);
  assert.doesNotMatch(html.slice(html.indexOf('id="factory-pulse"'), html.indexOf('<section class="oss"')), /agents online|workers online/);
});

test('existing intro copy remains unchanged by this UI update', async () => {
  const html = await source('index.html');
  assert.match(html, /builder\. engineer\. scientist\. solutions architect\. systems thinker\. automator\./);
  assert.match(html, /civilization advances by automating important actions/);
});

test('UI-only release has an independent GitHub Pages path and verifies the shipped assets', async () => {
  const yaml = await source('.github/workflows/deploy-ui.yml');
  const verifier = await source('scripts/check-ui-deploy.mjs');
  assert.match(yaml, /branches: \[main\]/);
  for (const name of ['index.html', 'app.js', 'styles.css']) {
    assert.ok(yaml.includes("'" + name + "'"));
  }
  assert.match(yaml, /actions\/upload-pages-artifact@v3/);
  assert.match(yaml, /actions\/deploy-pages@v4/);
  assert.match(yaml, /scripts\/check-ui-deploy\.mjs/);
  assert.match(verifier, /Live Boplog UI matches published index\.html/);
});
