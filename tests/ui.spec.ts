import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page) {
  await page.goto('/#/signin');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByRole('heading', { name: 'Alice Eagle', exact: true })).toBeVisible();
}

test('existing hash routes render without application errors', async ({ page }) => {
  await signIn(page);
  const created = await page.request.post('/api/rides', { headers: { Origin: 'http://127.0.0.1:3100' }, data: {
    origin: { name: 'Boston College', address: null, terminal: null },
    destination: { name: 'Logan Airport (BOS)', address: null, terminal: 'C' },
    departureTime: '2030-01-01T12:00:00Z', seatsTotal: 4,
    luggageType: 'ONE_SUITCASE', flexibility: 'EXACT', estimatedTotalCostCents: 5000,
  }});
  expect(created.status()).toBe(201);
  const ride = await created.json();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // External maps/fonts are not required to verify application navigation.
  await page.route(/https:\/\/(maps\.google\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)/, route => route.abort());
  for (const [route, heading] of [
    ['/', 'Request a ride'], ['/create', 'Request a ride'], ['/find', 'Find a Ride'],
    ['/dashboard', 'Ready to fly, Baldwin?'], ['/profile', 'Alice Eagle'],
    ['/about', 'EagleRide'], [`/ride/${ride.id}`, 'To Logan Airport (BOS) (C)'],
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


test('ride creation is visible in a separate browser context without local ride storage', async ({ browser }) => {
  const clientA = await browser.newContext();
  const clientB = await browser.newContext();
  try {
    const pageA = await clientA.newPage();
    const pageB = await clientB.newPage();
    await signIn(pageA);
    await pageA.goto('/#/create');
    await pageA.getByPlaceholder('Pickup location').fill('Boston College');
    await pageA.getByPlaceholder('Dropoff location').fill('Logan Airport (BOS)');
    // Select the suggestion so its overlay no longer covers the terminal buttons.
    await pageA.getByText('Logan Airport (BOS)', { exact: true }).click();
    await pageA.getByRole('button', { name: 'C', exact: true }).click();
    await pageA.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(pageA.getByRole('heading', { name: /^(Similar rides found|Confirm your ride)$/ })).toBeVisible();
    if (await pageA.getByRole('heading', { name: 'Similar rides found' }).isVisible()) {
      await pageA.getByRole('button', { name: 'Create my own ride' }).click();
    }
    await expect(pageA.getByRole('heading', { name: 'Confirm your ride' })).toBeVisible();
    await pageA.getByRole('button', { name: 'Post Ride', exact: true }).click();
    await expect(pageA).toHaveURL(/#\/ride\/[a-f0-9-]+$/);
    const id = pageA.url().split('/').at(-1)!;
    await pageB.goto('/#/find');
    await expect(pageB.locator(`a[href="#/ride/${id}"]`)).toBeVisible();
    await pageB.locator(`a[href="#/ride/${id}"]`).click();
    await expect(pageB.getByRole('heading', { name: 'To Logan Airport (BOS) (C)' })).toBeVisible();
    for (const page of [pageA, pageB]) {
      expect(await page.evaluate(() => localStorage.getItem('er_rides'))).toBeNull();
      expect(await page.evaluate(() => localStorage.getItem('er_participants'))).toBeNull();
    }
  } finally {
    // A test timeout may already have closed the contexts; preserve the original failure.
    await Promise.allSettled([clientA.close(), clientB.close()]);
  }
});

test('ride loading failures and not-found states are visible', async ({ page }) => {
  await page.goto('/#/ride/00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('alert')).toHaveText('Ride not found.');
  await page.route('**/api/rides', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' }));
  await page.goto('/#/find');
  await expect(page.getByRole('alert')).toContainText('Unable to load rides');
  await page.route('**/api/rides', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('heading', { name: 'No Matches Found' })).toBeVisible();
});


test('authentication protects creation and shows real identity without browser tokens', async ({ page }) => {
  await page.goto('/#/create');
  await expect(page.getByText('Sign in with your verified BC email to continue.')).toBeVisible();
  await expect(page.getByPlaceholder('Pickup location')).toHaveCount(0);
  await signIn(page);
  await expect(page.getByText('alice@bc.edu', { exact: true })).toBeVisible();
  await expect(page.getByText('Verified BC email', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.cookie)).not.toContain('er-auth');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toMatch(/access_token|refresh_token|GOOGLE_ACCESS|GOOGLE_REFRESH/);
  const cookies = await page.context().cookies();
  expect(cookies.filter(cookie => cookie.name.startsWith('er-auth.')).every(cookie => cookie.httpOnly && cookie.sameSite === 'Lax')).toBe(true);
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);
  await page.goto('/#/profile');
  await expect(page.getByText('Sign in with your verified BC email to continue.')).toBeVisible();
});


test('a delayed identity response cannot restore the profile after logout', async ({ page }) => {
  await signIn(page);
  let release!: () => void;
  let started!: () => void;
  let completed!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const requested = new Promise<void>(resolve => { started = resolve; });
  const delivered = new Promise<void>(resolve => { completed = resolve; });
  await page.route('**/api/auth/me', async route => {
    const response = await route.fetch();
    started();
    await held;
    await route.fulfill({ response });
    completed();
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await requested;
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  release();
  await delivered;
  await page.goto('/#/profile');
  await expect(page.getByText('Sign in with your verified BC email to continue.')).toBeVisible();
});

test('logout failure is explicit and can be retried', async ({ page }) => {
  await signIn(page);
  await page.route('**/api/auth/logout', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' }));
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Sign-out could not be fully confirmed');
  await page.unroute('**/api/auth/logout');
  await page.getByRole('button', { name: 'Retry sign out', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);
});
