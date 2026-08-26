const { test, expect } = require('@playwright/test');

const previewCounts = {
  desktop: { featured: 6, oss: 8, builds: 12 },
  mobile: { featured: 4, oss: 5, builds: 8 },
};

async function expectPreviewCounts(page, expected) {
  await expect(page.locator('#featured-list .featured-item')).toHaveCount(expected.featured);
  await expect(page.locator('#oss-ledger article')).toHaveCount(expected.oss);
  await expect(page.locator('#project-archive .project-row')).toHaveCount(expected.builds);
}

test('progressive disclosure previews, expands, persists, and follows responsive limits', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:4173/');
  await expectPreviewCounts(page, previewCounts.desktop);
  const featuredTotal = Number(await page.locator('[data-disclosure="featured"]').getAttribute('data-total'));

  for (const [section, param, list, row] of [
    ['featured', 'featured=all', '#featured-list', '.featured-item'],
    ['oss', 'oss_rows=all', '#oss-ledger', 'article'],
    ['builds', 'builds=all', '#project-archive', '.project-row'],
  ]) {
    const control = page.locator(`[data-disclosure="${section}"]`);
    const total = Number(await control.getAttribute('data-total'));
    await expect(control).toHaveAttribute('aria-expanded', 'false');
    await expect(control).toContainText(`show all ${total}`);
    await control.click();
    await expect(page).toHaveURL(new RegExp(param));
    await expect(control).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator(`${list} ${row}`)).toHaveCount(total);
    await page.reload();
    await expect(page.locator(`[data-disclosure="${section}"]`)).toHaveAttribute('aria-expanded', 'true');
    await page.locator(`[data-disclosure="${section}"]`).click();
    await expect(page).not.toHaveURL(new RegExp(param));
    await expect(page.locator(`[data-disclosure="${section}"]`)).toBeFocused();
  }

  await page.locator('[data-disclosure="featured"]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#featured-list .featured-item')).toHaveCount(featuredTotal);
  await expect(page.locator('#oss-ledger article')).toHaveCount(previewCounts.mobile.oss);
  await expect(page.locator('#project-archive .project-row')).toHaveCount(previewCounts.mobile.builds);
});

test('meaningful filters show every match while totals and empty states stay honest', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/?oss_scope=upstream&year=2026');
  await expect(page.locator('#oss-count')).toHaveText(/^\d+ \/ \d+$/);
  await expect(page.locator('#result-count')).toHaveText(/^\d+ \/ \d+$/);
  const ossTotal = Number((await page.locator('#oss-count').textContent()).split('/')[0].trim());
  const buildTotal = Number((await page.locator('#result-count').textContent()).split('/')[0].trim());
  await expect(page.locator('#oss-ledger article')).toHaveCount(ossTotal);
  await expect(page.locator('#project-archive .project-row')).toHaveCount(buildTotal);

  await page.locator('#project-search').fill('no-project-can-match-this-value');
  await expect(page.locator('#result-count')).toContainText('0 /');
  await expect(page.locator('#project-archive .project-row')).toHaveCount(0);
  await expect(page.locator('#empty-state')).toBeVisible();
});

test('disclosure history restores with back and forward and controls are accessible', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/');
  const featured = page.locator('[data-disclosure="featured"]');
  await expect(featured).toHaveAttribute('aria-controls', 'featured-list');
  await featured.click();
  await page.locator('[data-disclosure="oss"]').click();
  await page.goBack();
  await expect(featured).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-disclosure="oss"]')).toHaveAttribute('aria-expanded', 'false');
  await page.goForward();
  await expect(page.locator('[data-disclosure="oss"]')).toHaveAttribute('aria-expanded', 'true');
});
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
