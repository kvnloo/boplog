const { test, expect } = require('@playwright/test');

const previewCounts = {
  desktop: { featured: 6, oss: 6, builds: 12 },
  mobile: { featured: 4, oss: 4, builds: 8 },
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
  // Featured curation may be longer than the preview; test the live control
  // rather than assuming an old six-project snapshot.
  const initialFeaturedTotal = Number((await page.locator('[data-disclosure="featured"]').getAttribute('data-total')) || '0');
  if (initialFeaturedTotal > previewCounts.desktop.featured) {
    await expect(page.locator('#featured-disclosure')).toBeVisible();
  } else {
    await expect(page.locator('#featured-disclosure')).toBeHidden();
  }

  for (const [section, param, list, row] of [
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

  await page.setViewportSize({ width: 390, height: 844 });
  const featured = page.locator('[data-disclosure="featured"]');
  await expect(page.locator('#featured-disclosure')).toBeVisible();
  await expect(featured).toHaveAttribute('aria-expanded', 'false');
  await expect(featured).toHaveText('show all 6');
  await featured.click();
  await expect(page).toHaveURL(/featured=all/);
  await expect(featured).toHaveAttribute('aria-expanded', 'true');
  const featuredTotal = Number(await featured.getAttribute('data-total'));
  await expect(page.locator('#featured-list .featured-item')).toHaveCount(featuredTotal);
  await expect(page.locator('#oss-ledger article')).toHaveCount(previewCounts.mobile.oss);
  await expect(page.locator('#project-archive .project-row')).toHaveCount(previewCounts.mobile.builds);
});

test('filters compact the OSS ledger by default without changing build-filter behavior', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/?oss_scope=upstream&year=2026');
  await expect(page.locator('#oss-count')).toHaveText(/^\d+ \/ \d+$/);
  await expect(page.locator('#result-count')).toHaveText(/^\d+ \/ \d+$/);
  const ossTotal = Number((await page.locator('#oss-count').textContent()).split('/')[0].trim());
  const buildTotal = Number((await page.locator('#result-count').textContent()).split('/')[0].trim());
  await expect(page.locator('#oss-ledger article')).toHaveCount(Math.min(ossTotal, previewCounts.desktop.oss));
  await expect(page.locator('#project-archive .project-row')).toHaveCount(buildTotal);
  if (ossTotal > previewCounts.desktop.oss) {
    const disclosure = page.locator('#oss-disclosure');
    await expect(disclosure).toBeVisible();
    await expect(disclosure.locator('[data-disclosure]')).toHaveAttribute('aria-expanded', 'false');
    await disclosure.locator('[data-disclosure]').click();
    await expect(page.locator('#oss-ledger article')).toHaveCount(ossTotal);
    await expect(page).toHaveURL(/oss_rows=all/);
  }
  // Build log retains its independent behavior for meaningful filters.
  await expect(page.locator('#builds-disclosure')).toContainText(`showing all ${buildTotal} filtered results`);
  await expect(page.locator('#builds-disclosure [data-disclosure]')).toBeHidden();

  await page.locator('#project-search').fill('no-project-can-match-this-value');
  await expect(page.locator('#result-count')).toContainText('0 /');
  await expect(page.locator('#project-archive .project-row')).toHaveCount(0);
  await expect(page.locator('#empty-state')).toBeVisible();
});

test('clearing forced filters restores compact previews and real disclosure controls', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/?oss_scope=upstream&year=2026');
  await page.locator('#oss-scopes [data-oss-scope="all_public"]').click();
  await page.locator('#clear-filters').click();

  await expect(page).not.toHaveURL(/(?:oss_scope|year|oss_rows|builds)=/);
  await expect(page.locator('#oss-ledger article')).toHaveCount(previewCounts.desktop.oss);
  await expect(page.locator('#project-archive .project-row')).toHaveCount(previewCounts.desktop.builds);
  for (const section of ['oss', 'builds']) {
    const control = page.locator(`[data-disclosure="${section}"]`);
    await expect(control).toBeVisible();
    await expect(control).toHaveAttribute('aria-expanded', 'false');
    await expect(control).toHaveAccessibleName(new RegExp(`show all \\d+ ${section}`));
  }
});

test('disclosure history restores with back and forward and controls are accessible', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/');
  const oss = page.locator('[data-disclosure="oss"]');
  await expect(oss).toHaveAttribute('aria-controls', 'oss-ledger');
  await oss.click();
  await page.locator('[data-disclosure="builds"]').click();
  await page.goBack();
  await expect(oss).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-disclosure="builds"]')).toHaveAttribute('aria-expanded', 'false');
  await page.goForward();
  await expect(page.locator('[data-disclosure="builds"]')).toHaveAttribute('aria-expanded', 'true');
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

test('OSS ledger expands then collapses from deep scroll without manually scrolling back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await page.goto('http://127.0.0.1:4173/');
  const disclosure = page.locator('#oss-disclosure [data-disclosure="oss"]');
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#oss-ledger article')).toHaveCount(previewCounts.mobile.oss);
  await disclosure.click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  const total = Number(await disclosure.getAttribute('data-total'));
  expect(total).toBeGreaterThan(30);
  await page.locator('#oss-ledger article').nth(28).scrollIntoViewIfNeeded();
  await expect(disclosure).toBeInViewport();
  const sticky = await disclosure.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= window.innerHeight;
  });
  expect(sticky).toBe(true);
  // Clicking this sticky control should require no manual return to the start.
  await disclosure.click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#oss-ledger article')).toHaveCount(previewCounts.mobile.oss);
  await expect(page).not.toHaveURL(/oss_rows=all/);
  await expect(disclosure).toBeFocused();
  await expect(disclosure).toBeInViewport();
});

test('factory pulse uses public snapshot values and respects reduced motion', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/');
  const factory = page.locator('#factory-pulse');
  await expect(factory).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#factory-snapshot')).toContainText('public GitHub snapshot');
  const metrics = page.locator('#factory-metrics');
  await expect(metrics).toContainText(/\d+ open-ready/);
  await expect(metrics).toContainText(/\d+ merged upstream/);
  await expect(metrics).toContainText(/\d+ communities/);
  const animation = factory.locator('.factory-pulse__signal i').first();
  await expect(animation).toHaveCSS('animation-name', 'factory-relay');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(animation).toHaveCSS('animation-name', 'none');
});

test('selected communities expose every group and preserve an accessible zero-group URL state', async ({ page }) => {
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', (request) => errors.push(`network: ${request.url()}`));
  await page.goto('http://127.0.0.1:4173/?oss_scope=selected#oss');
  const groups = page.locator('#oss-groups [data-oss-group]');
  const scopeSnapshot = await page.evaluate(async () =>
    fetch('./data/oss-scopes.json').then((response) => response.json()));
  await expect(groups).toHaveCount(scopeSnapshot.groups.length);
  await expect(page.locator('[data-oss-group="hermes"]')).toContainText('Hermes');
  await expect(page.locator('[data-oss-group="hermes"]')).toContainText('NousResearch/hermes-agent');
  for (const [id, label, repo] of [
    ['oh-my-pi', 'Oh My Pi', 'can1357/oh-my-pi'],
    ['gods-eye-view', "God's Eye View", 'bilawalsidhu/gods-eye-view'],
    ['cua', 'CUA', 'trycua/cua'],
    ['noop', 'NOOP', 'ryanbr/noop'],
    ['noctalia', 'Noctalia', 'noctalia-dev/noctalia'],
    ['o8', 'o8', 'hurttlocker/o8'],
    ['rust', 'Rust', 'rust-lang/rust'],
  ]) {
    await expect(page.locator(`[data-oss-group="${id}"]`)).toContainText(label);
    await expect(page.locator(`[data-oss-group="${id}"]`)).toContainText(repo);
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
