import { expect, test } from '@playwright/test';

test('Library, Settings, browser history and bookmarked screens', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toHaveAttribute('data-settings-update', /none|available/);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.locator('[data-audio-diagnostics]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share audio diagnostics', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset audio engine', exact: true })).toBeVisible();
  await expect(page.getByText('No song IDs or audio samples are included.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Display', exact: true })).toBeVisible();
  await expect(page.getByText('Controls visual smoothness, not song tempo.', { exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Timeline frame rate: 60 fps', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: 'Timeline frame rate: Maximum', exact: true }).check();
  await expect(page.locator('[data-display-frame-rate]')).toHaveAttribute('data-display-frame-rate', 'maximum');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('acquiring-display') || '{}'))).toEqual({timelineFrameRate: 'maximum'});
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Timeline frame rate: Maximum', exact: true })).toBeChecked();
  await expect(page.locator('[data-app-updates]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Play Store for updates', exact: true })).toBeVisible();
  await expect.poll(async () => page.locator('[data-app-update-status]').getAttribute('data-app-update-status'))
    .toMatch(/UP_TO_DATE|UNAVAILABLE/);
  const updatesBeforeDisplay = await page.evaluate(() => {
    const updates = document.querySelector('[data-app-updates]');
    const display = [...document.querySelectorAll('h2')].find(node => node.textContent === 'Display');
    if (!updates || !display) return false;
    return !!(updates.compareDocumentPosition(display) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(updatesBeforeDisplay).toBe(true);
  await expect(page.locator('[data-app-version]')).toHaveText('Version 0.1.0 (build 1)');
  const privacy = page.getByRole('link', { name: 'Privacy policy', exact: true });
  await expect(privacy).toHaveAttribute('href', 'https://bellsworth.dev/apps/acquiring/privacy/');
  await expect(page.getByRole('heading', { name: 'Privacy', exact: true })).toBeVisible();
  const privacyAfterVersion = await page.evaluate(() => {
    const version = document.querySelector('[data-app-version]');
    const privacyHeading = [...document.querySelectorAll('h2')].find(node => node.textContent === 'Privacy');
    if (!version || !privacyHeading) return false;
    return !!(version.compareDocumentPosition(privacyHeading) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(privacyAfterVersion).toBe(true);
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  await page.getByRole('button', { name: 'Share audio diagnostics', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('"schemaVersion":1');
  expect(await page.evaluate(() => navigator.clipboard.readText())).not.toContain('pcm');
  await page.getByRole('button', { name: 'Reset audio engine', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('acquiring-onboarding'))).toContain('hasCompletedIntroduction');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('acquiring-display') || '{}'))).toEqual({timelineFrameRate: 'maximum'});
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
  await page.goto('/help');
  await expect(page.getByRole('heading', { name: 'Help', exact: true })).toBeVisible();
  await expect(page.locator('[data-help-index]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Instructions', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Intervals', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Instructions', exact: true }).click();
  await expect(page.locator('[data-help-article="help.topic.instructions"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Introduction', exact: true })).toBeVisible();
  await expect(page.locator('[data-introduction="octave"]')).toContainText('octave');
  await page.locator('.help-article__back').click();
  await expect(page.locator('[data-help-index]')).toBeVisible();
  await page.getByRole('button', { name: 'Scale degrees', exact: true }).click();
  await expect(page.locator('[data-help-article="help.topic.scaleDegrees"]')).toContainText('hat above a number');
  await expect(page.locator('[data-help-degrees]')).toHaveAttribute('data-help-degrees','1234567');
  await page.locator('.help-article__back').click();
  await page.getByRole('button', { name: 'Roman numerals', exact: true }).click();
  await expect(page.locator('[data-help-roman="quality"]')).toBeVisible();
  await expect(page.locator('[data-help-roman="applied"]')).toContainText('V/V');
  await expect(page.locator('[data-help-roman-borrowed="iv"]')).toContainText('(min)');
  await expect(page.getByText('five of five', { exact: false })).toBeVisible();
  await page.locator('.help-article__back').click();
  await expect(page.locator('[data-help-index]')).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/settings$/);
});

test('narrow mobile and enlarged text retain accessible controls without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/settings');
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const box = await page.getByRole('button', { name: 'Back', exact: true }).boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test('installed shell cold reloads and opens a deep link offline', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
  expect(manifest.display).toBe('standalone');
  expect(manifest.name).toBe('Acquiring');
});
