const { test, expect } = require('@playwright/test');
test('desktop, url state, keyboard, reduced motion, and mobile', async ({ page }) => {
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', (request) => errors.push(`network: ${request.url()}`));
  await page.goto('http://127.0.0.1:4173/?oss_scope=upstream&oss_status=merged#oss');
  await expect(page.locator('#oss-scopes [data-oss-scope="upstream"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#oss-status')).toHaveValue('merged');
  await expect(page.locator('#oss-ledger article').first()).toBeVisible();
  await page.screenshot({ path: '/tmp/boplog-oss-desktop.png', fullPage: true });
  const badge = page.locator('.oss-badge.is-unlocked').first();
  await badge.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/oss_scope=upstream/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(badge).toHaveCSS('animation-duration', '1e-05s');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator('#oss')).toBeVisible();
  await page.screenshot({ path: '/tmp/boplog-oss-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('selected communities expose every group and preserve an accessible zero-group URL state', async ({ page }) => {
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', (request) => errors.push(`network: ${request.url()}`));
  await page.goto('http://127.0.0.1:4173/?oss_scope=selected#oss');
  const groups = page.locator('#oss-groups [data-oss-group]');
  await expect(groups).toHaveCount(4);
  await expect(page.locator('[data-oss-group="hermes"]')).toContainText('Hermes');
  await expect(page.locator('[data-oss-group="hermes"]')).toContainText('NousResearch/hermes-agent');
  await expect(page.locator('[data-oss-group="hermes"]')).toContainText('33');
  for (const [id, label, repo] of [
    ['opencode', 'OpenCode', 'anomalyco/opencode'],
    ['rust', 'Rust', 'rust-lang/rust'],
    ['python', 'Python', 'python/cpython'],
  ]) {
    await expect(page.locator(`[data-oss-group="${id}"]`)).toContainText(label);
    await expect(page.locator(`[data-oss-group="${id}"]`)).toContainText(repo);
    await expect(page.locator(`[data-oss-group="${id}"]`)).toContainText('0');
  }
  await page.screenshot({ path: '/tmp/boplog-oss-selected-desktop.png', fullPage: true });

  const rust = page.locator('[data-oss-group="rust"]');
  await rust.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/oss_scope=selected/);
  await expect(page).toHaveURL(/oss_repo=rust-lang%2Frust/);
  await expect(rust).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#oss-ledger')).toContainText('no public records match this view');
  await page.reload();
  await expect(page.locator('[data-oss-group="rust"]')).toHaveAttribute('aria-pressed', 'true');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator('#oss-groups')).toBeVisible();
  await expect(page.locator('[data-oss-group="python"]')).toContainText('Python');
  await page.screenshot({ path: '/tmp/boplog-oss-selected-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('same-origin links resolve without errors', async ({ page, request }) => {
  await page.goto('http://127.0.0.1:4173/');
  const links = await page.locator('a[href]').evaluateAll((anchors) => [...new Set(anchors
    .map((anchor) => new URL(anchor.href, window.location.href))
    .filter((url) => url.origin === window.location.origin)
    .map((url) => `${url.origin}${url.pathname}${url.search}`))]);
  for (const link of links) {
    const response = await request.get(link);
    expect(response.ok(), `${link} returned ${response.status()}`).toBe(true);
  }
});

test('interaction lab has exactly two quiet same-origin entry points and stays private to crawlers', async ({ page, request }) => {
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', (failedRequest) => errors.push(`network: ${failedRequest.url()}`));

  await page.goto('http://127.0.0.1:4173/');
  await expect(page.locator('h1')).toHaveText('kevin rajan');
  await expect(page.locator('#oss')).toBeVisible();
  await page.locator('#links').evaluate((details) => { details.open = true; });

  const labLinks = page.locator('a[href="./dev/"]');
  await expect(labLinks).toHaveCount(2);
  await expect(page.locator('.links-panel__col').filter({ hasText: 'surfaces' }).getByRole('link', { name: 'interaction lab ↗' }))
    .toHaveAttribute('title', 'Experimental design workshop');
  await expect(page.locator('footer').getByRole('link', { name: 'design lab' })).toBeVisible();
  for (const link of await labLinks.all()) {
    await expect(link).toHaveAttribute('href', './dev/');
    expect(await link.evaluate((anchor) => new URL(anchor.getAttribute('href'), 'https://kvnloo.github.io/boplog/').pathname))
      .toBe('/boplog/dev/');
  }

  await labLinks.first().focus();
  await expect(labLinks.first()).toBeFocused();
  await expect(labLinks.first()).toHaveCSS('outline-style', 'solid');

  const labResponse = await request.get('http://127.0.0.1:4173/dev/');
  expect(labResponse.ok()).toBe(true);
  await page.goto('http://127.0.0.1:4173/dev/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
  const robots = await (await request.get('http://127.0.0.1:4173/robots.txt')).text();
  expect(robots).toContain('Disallow: /dev/');

  await page.goto('http://127.0.0.1:4173/');
  await page.locator('#links').evaluate((details) => { details.open = true; });
  await page.screenshot({ path: '/tmp/boplog-interaction-lab-desktop.png', fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator('#links').evaluate((details) => { details.open = true; });
  for (const region of [page.locator('.links-panel__grid'), page.locator('.footer-bar')]) {
    const box = await region.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  await page.screenshot({ path: '/tmp/boplog-interaction-lab-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
