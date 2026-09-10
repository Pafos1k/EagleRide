import { expect, test } from '@playwright/test';

test('existing hash routes render without application errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // External maps/fonts are not required to verify application navigation.
  await page.route(/https:\/\/(maps\.google\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)/, route => route.abort());
  for (const [route, heading] of [
    ['/', 'Request a ride'], ['/create', 'Request a ride'], ['/find', 'Find a Ride'],
    ['/dashboard', 'Ready to fly, Baldwin?'], ['/profile', 'Baldwin Eagle'],
    ['/about', 'EagleRide'], ['/ride/r1', 'To Logan Airport (C)'],
  ]) {
    await page.goto(`/#${route}`);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByAltText('EagleRide Logo').first()).toBeVisible();
    await expect.poll(() => page.getByAltText('EagleRide Logo').first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  }
  await page.goto('/#/chat/r1');
  await expect(page.getByPlaceholder('Type your message...')).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile navigation still opens and changes routes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Toggle navigation menu' }).click();
  await page.getByRole('link', { name: 'Find a split', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Find a Ride' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Toggle navigation menu' })).toHaveAttribute('aria-expanded', 'false');
});
