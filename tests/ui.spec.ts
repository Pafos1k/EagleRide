import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page, identity = 'alice') {
  await page.request.post('http://127.0.0.1:3101/__test/select-user', { data: { user: identity } });
  await page.goto('/#/signin');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByRole('heading', { name: identity === 'alice' ? 'Alice Eagle' : 'Bob Eagle', exact: true })).toBeVisible();
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
    ['/dashboard', 'Ready to fly, Alice?'], ['/profile', 'Alice Eagle'],
    ['/about', 'EagleRide'], [`/ride/${ride.id}`, 'To Logan Airport (BOS) (C)'],
  ]) {
    await page.goto(`/#${route}`);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByAltText('EagleRide Logo').first()).toBeVisible();
    await expect.poll(() => page.getByAltText('EagleRide Logo').first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  }
  await page.goto('/#/chat/r1');
  await expect(page.getByRole('alert')).toHaveText('Ride not found.');
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
    await expect(pageA.getByRole('heading', { name: 'Similar rides found' }).or(pageA.getByRole('button', {name:'Post Ride',exact:true}))).toBeVisible();
    if (await pageA.getByRole('heading', { name: 'Similar rides found' }).isVisible()) {
      await pageA.getByRole('button', { name: 'Create my own ride' }).click();
    }
    await expect(pageA.getByRole('button', { name: 'Post Ride', exact: true })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Request a ride', exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Pickup location')).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Sign in to EagleRide' })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Sign in to EagleRide' })).toBeVisible();
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


async function createFutureRide(page: Page) {
  const response = await page.request.post('/api/rides', { headers: { Origin: 'http://127.0.0.1:3100' }, data: {
    origin: { name: 'Browser operations test', address: null, terminal: null },
    destination: { name: 'Boston College', address: null, terminal: null },
    departureTime: new Date(Date.now() + 86400000).toISOString(), seatsTotal: 2,
    luggageType: 'ONE_SUITCASE', flexibility: 'EXACT', estimatedTotalCostCents: 2400,
  } });
  expect(response.status()).toBe(201); return response.json();
}
test('public Home, About, list and details stay public; create preserves its return destination', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Request a ride', exact: true })).toBeVisible();
  // Home is the request form; continuing still requires authentication.
  await page.getByPlaceholder('Pickup location').fill('Newton Campus');
  await page.getByPlaceholder('Dropoff location').fill('Boston College');
  await page.getByRole('heading', { name: 'Request a ride', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/signin\?returnTo=%2Fcreate/);
  await page.request.post('http://127.0.0.1:3101/__test/select-user', { data: { user: 'alice' } });
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByRole('heading', { name: 'Request a ride', exact: true })).toBeVisible();
  const ride = await createFutureRide(page);
  await page.goto('/#/profile'); await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  for (const [route, heading] of [['/', 'Request a ride'], ['/about', 'EagleRide'], ['/find', 'Find a Ride'], ['/ride/' + ride.id, 'To Boston College']]) {
    await page.goto('/#' + route);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: 'Check live route in Google Maps' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in to join' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in to join' }).click();
  await expect(page).toHaveURL(/signin\?returnTo=/);
  await page.request.post('http://127.0.0.1:3101/__test/select-user', { data: { user: 'bob' } });
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page).toHaveURL(new RegExp('ride/' + ride.id));
  await expect(page.getByRole('button', { name: 'Join ride', exact: true })).toBeVisible();
});
test('PostgreSQL join, leave, cancellation and Activity work across authenticated browsers', async ({ browser }) => {
  const host = await browser.newContext(), guest = await browser.newContext();
  try {
    const hostPage = await host.newPage(), guestPage = await guest.newPage();
    await signIn(hostPage);
    const ride = await createFutureRide(hostPage);
    await signIn(guestPage, 'bob');
    await guestPage.goto('/#/ride/' + ride.id);
    await guestPage.getByRole('button', { name: 'Join ride', exact: true }).click();
    await expect(guestPage.getByRole('button', { name: 'Leave ride', exact: true })).toBeVisible();
    await guestPage.goto('/#/dashboard');
    await expect(guestPage.locator('a[href="#/ride/' + ride.id + '"]')).toContainText('Joined');
    // Poison legacy storage: Activity must remain solely API-backed.
    await guestPage.evaluate(() => {
      localStorage.setItem('er_rides', JSON.stringify([{ id: 'fake', destination: 'FAKE LOCAL RIDE' }]));
      localStorage.setItem('er_participants', JSON.stringify([{ rideId: 'fake' }]));
    });
    await guestPage.reload();
    await expect(guestPage.locator('a[href="#/ride/' + ride.id + '"]')).toBeVisible();
    await expect(guestPage.getByText('FAKE LOCAL RIDE')).toHaveCount(0);
    await guestPage.goto('/#/ride/' + ride.id);
    await guestPage.getByRole('button', { name: 'Leave ride', exact: true }).click();
    await expect(guestPage.getByRole('button', { name: 'Join ride', exact: true })).toBeVisible();
    await guestPage.getByRole('button', { name: 'Join ride', exact: true }).click();
    await expect(guestPage.getByRole('button', { name: 'Leave ride', exact: true })).toBeVisible();
    await hostPage.goto('/#/ride/' + ride.id);
    await hostPage.getByRole('button', { name: 'Cancel ride', exact: true }).click();
    await expect(hostPage.getByText('Cancelled — this ride cannot be joined.')).toBeVisible();
    await guestPage.goto('/#/dashboard');
    await expect(guestPage.locator('section').filter({ has: guestPage.getByRole('heading', { name: 'Cancelled', exact: true }) }).locator('a[href="#/ride/' + ride.id + '"]')).toBeVisible();
    await hostPage.goto('/#/dashboard');
    await expect(hostPage.locator('a[href="#/ride/' + ride.id + '"]')).toContainText('Hosted by you');
    await guestPage.goto('/#/ride/' + ride.id);
    await expect(guestPage.getByRole('button', { name: 'Join ride', exact: true })).toHaveCount(0);
    await expect(guestPage.getByRole('link', { name: 'View chat history' })).toBeVisible();
  } finally { await Promise.allSettled([host.close(), guest.close()]); }
});


test('QA: every public route survives a logged-out auth response and private routes still redirect', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Please sign in."}' }));
  for (const [path, heading] of [['/', 'Request a ride'], ['/#/', 'Request a ride'], ['/#/find', 'Find a Ride'], ['/#/about', 'EagleRide']]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page).not.toHaveURL(/signin/);
  }
  await page.goto('/#/ride/00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('alert')).toHaveText('Ride not found.');
  await expect(page).not.toHaveURL(/signin/);
  for (const path of ['/dashboard', '/profile']) {
    await page.goto('/#' + path);
    await expect(page.getByRole('heading', { name: 'Sign in to EagleRide' })).toBeVisible();
    await expect(page).toHaveURL(new RegExp('returnTo=' + encodeURIComponent(path)));

  }
});

test('QA: Activity keeps personal cards and moves cancellation out of upcoming on return', async ({ browser }) => {
  const host = await browser.newContext(), guest = await browser.newContext();
  try {
    const a = await host.newPage(), b = await guest.newPage();
    await signIn(a);
    const own = await createFutureRide(a);
    await signIn(b, 'bob');
    const unrelated = await createFutureRide(b);
    await a.goto('/#/dashboard');
    await expect(a.getByRole('heading', { name: 'Ready to fly, Alice?', exact: true })).toBeVisible();
    await expect(a.getByRole('region', { name: 'Upcoming Journeys' }).locator('a[href="#/ride/' + own.id + '"]')).toBeVisible();
    await expect(a.locator('a[href="#/ride/' + unrelated.id + '"]')).toHaveCount(0);
    await expect(a.getByRole('button', { name: /join/i })).toHaveCount(0);
    // Keep Activity mounted while a separate host tab cancels the same ride.
    const detail = await host.newPage();
    await detail.goto('/#/ride/' + own.id);
    await detail.getByRole('button', { name: 'Cancel ride', exact: true }).click();
    await expect(detail.getByText('Cancelled — this ride cannot be joined.')).toBeVisible();
    await a.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(a.getByRole('region', { name: 'Upcoming Journeys' }).locator('a[href="#/ride/' + own.id + '"]')).toHaveCount(0);
    await expect(a.getByRole('region', { name: 'Cancelled', exact: true }).locator('a[href="#/ride/' + own.id + '"]')).toBeVisible();
    expect((await a.request.get('/api/rides/' + own.id)).status()).toBe(200);
    await a.goto('/#/find');
    await expect(a.locator('a[href="#/ride/' + unrelated.id + '"]')).toBeVisible();
    await expect(a.locator('a[href="#/ride/' + own.id + '"]')).toHaveCount(0);

  } finally { await Promise.allSettled([host.close(), guest.close()]); }
});

test('QA: logged-out header Sign in navigates from public and request routes', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Please sign in."}' }));
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ['/', '/find', '/about', '/ride/00000000-0000-4000-8000-000000000000', '/create']) {
      await page.goto('/#' + path);
      if (path === '/create') await expect(page.getByPlaceholder('Pickup location')).toBeVisible();
      const control = page.locator('header a[href="#/signin"]');
      await control.click();
      await expect(page).toHaveURL(/#\/signin$/);
      await expect(page.getByRole('heading', { name: 'Sign in to EagleRide', exact: true })).toBeVisible();
    }
  }
});


test('chat persists across refresh, uses real identity and becomes read-only after cancellation', async ({ page }) => {
  await signIn(page);
  const ride = await createFutureRide(page);
  await page.goto('/#/ride/' + ride.id);
  await page.getByRole('link', { name: 'Open ride chat' }).click();
  await expect(page.getByText('No messages yet.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Hey everyone! Looking forward/)).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Browser persistent message');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText('Browser persistent message', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Browser persistent message', { exact: true })).toBeVisible();
  expect((await page.request.post('/api/rides/' + ride.id + '/cancel', { headers: { Origin: 'http://127.0.0.1:3100' } })).status()).toBe(200);
  await page.getByRole('button', { name: 'Refresh chat' }).click();
  await expect(page.getByText('This ride is cancelled. Chat history is read-only.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await page.goto('/#/profile');
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
  await signIn(page, 'bob');
  await page.goto('/#/chat/' + ride.id);
  await expect(page.getByRole('alert')).toHaveText('Only current participants can access this chat.');
  await expect(page.getByText('Browser persistent message', { exact: true })).toHaveCount(0);
});

test('routing unavailable does not block ride creation and never displays fabricated distance or ETA', async ({ page }) => {
  await signIn(page);
  await page.route('**/route-snapshot', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({data:null,estimatedFareCents:null,lastAttemptAt:new Date().toISOString(),latestRefreshFailed:true}) }));
  await page.goto('/#/create');
  await page.getByPlaceholder('Pickup location').fill('Unique custom pickup');
  await page.getByPlaceholder('Dropoff location').fill('Unique custom destination');
  await page.getByRole('heading', { name: 'Request a ride', exact: true }).click();
  await expect(page.getByText(/Estimated fare|Available on Ride Detail|Split 4 ways/)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Check live route in Google Maps' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Post Ride', exact: true })).toBeVisible();
  await expect(page.getByText('Confirm your ride',{exact:true})).toHaveCount(0);
  await expect(page.getByPlaceholder('Pickup location')).toHaveValue('Unique custom pickup');
  await expect(page.getByPlaceholder('Dropoff location')).toHaveValue('Unique custom destination');
  await page.getByRole('button',{name:'Edit details',exact:true}).click();
  await expect(page.getByPlaceholder('Pickup location')).toHaveValue('Unique custom pickup');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  const saved = page.waitForResponse(response => response.url().endsWith('/api/rides') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Post Ride', exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  expect((await response.json()).estimatedTotalCostCents).toBeNull();
  await expect(page.getByText('Live route information is unavailable.', { exact: true })).toBeVisible();
  await expect(page.getByText(/55[–-]70/)).toHaveCount(0);
});
test('route display uses provider distance and marks fallback duration without live traffic claims', async ({ page }) => {
  await signIn(page);
  const ride = await createFutureRide(page);
  await page.route('**/route-snapshot', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({estimatedFareCents:2400,latestRefreshFailed:false,lastAttemptAt:null,data:{
    distanceMeters: 16093, durationSeconds: 1200, trafficAwareDurationSeconds: null, source: 'google-routes',
    calculatedAt: new Date().toISOString(), departureTime: new Date().toISOString(), timing: 'current',
  }}) }));
  await page.goto('/#/ride/' + ride.id);
  await expect(page.getByText('10.0 mi · 20 min driving', { exact: true })).toBeVisible();
  await expect(page.getByText(/Driving estimate · traffic unavailable/)).toBeVisible();
  await expect(page.getByText(/Traffic-aware driving estimate/)).toHaveCount(0);
});


test('Create, Find and Activity never request routing; confirmation has no route or fare content', async ({ page }) => {
  await signIn(page);
  const calls: string[] = [];
  page.on('request', request => { if (/api\/routes|route-snapshot/.test(request.url())) calls.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Request a ride',exact:true})).toBeVisible();
  await page.getByPlaceholder('Pickup location').fill('No routing pickup ' + Date.now());
  await page.getByPlaceholder('Dropoff location').fill('No routing destination');
  await page.getByRole('heading', {name:'Request a ride',exact:true}).click();
  await page.getByRole('button', {name:'Continue',exact:true}).click();
  await expect(page.getByRole('button', {name:'Post Ride',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Check live route in Google Maps'})).toHaveCount(0);
  await expect(page.getByText(/Estimated fare|Available on Ride Detail|Split 4 ways/)).toHaveCount(0);
  for(const route of ['/find','/dashboard']){
    await page.goto('/#'+route);
    await expect(page.getByRole('heading',{name:route==='/find'?'Find a Ride':'Ready to fly, Alice?',exact:true})).toBeVisible();
  }
  expect(calls).toEqual([]);
});
test('failed snapshot refresh displays the previous data, fixed fare and timestamp', async ({page}) => {
  await signIn(page);const ride=await createFutureRide(page);
  await page.route('**/route-snapshot',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({
    data:{distanceMeters:16093,durationSeconds:1200,trafficAwareDurationSeconds:1800,source:'google-routes',
      calculatedAt:'2026-09-01T12:00:00Z',departureTime:'2026-09-17T12:00:00Z',timing:'scheduled'},
    estimatedFareCents:2400,lastAttemptAt:new Date().toISOString(),latestRefreshFailed:true,
  })}));
  await page.goto('/#/ride/'+ride.id);
  await expect(page.getByText('10.0 mi · 30 min driving',{exact:true})).toBeVisible();
  await expect(page.getByText('Total $24.00',{exact:true})).toBeVisible();
  await expect(page.getByText(/Latest refresh failed/)).toBeVisible();
  await expect(page.getByText(/Google Maps · Updated/)).toBeVisible();
  await expect(page.getByText('Live route information is unavailable.',{exact:true})).toHaveCount(0);
});

test('request hero centers responsive controls and keeps confidence below the fold', async ({ page }) => {
  for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('heading',{name:'Request a ride',exact:true})).toBeVisible();
    const pickup=await page.getByPlaceholder('Pickup location').boundingBox();
    const dropoff=await page.getByPlaceholder('Dropoff location').boundingBox();
    const proceed=await page.getByRole('button',{name:'Continue',exact:true}).boundingBox();
    const date=await page.getByText('Today',{exact:true}).locator('..').boundingBox();
    const time=await page.getByText('Now',{exact:true}).locator('..').boundingBox();
    expect(Math.abs(date!.y-time!.y)).toBeLessThan(5);
    expect(Math.abs(date!.width-time!.width)).toBeLessThan(2);
    expect(date!.height).toBe(viewport.width < 768 ? 52 : 44);
    await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeDisabled();
    await expect(page.getByRole('button',{name:'Continue',exact:true})).toHaveCSS('color','rgb(255, 255, 255)');
    await expect(page.getByRole('button',{name:'Continue',exact:true})).toHaveCSS('background-color','rgb(0, 0, 0)');
    const confidence=await page.getByText('Ride with confidence',{exact:true}).boundingBox();
    expect(pickup).not.toBeNull();expect(dropoff).not.toBeNull();expect(proceed).not.toBeNull();
    expect(confidence!.y).toBeGreaterThanOrEqual(viewport.height);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    if(viewport.width>768){
      expect(Math.abs(pickup!.y-dropoff!.y)).toBeLessThan(5);
      expect(proceed!.x).toBeGreaterThan(dropoff!.x);
    }else{
      expect(dropoff!.y).toBeGreaterThan(pickup!.y);
      expect(date!.y).toBeGreaterThan(dropoff!.y);
      expect(proceed!.y).toBeGreaterThan(date!.y+date!.height);
      expect(proceed!.width).toBeGreaterThan(viewport.width-60);
    }
    await expect(page.getByRole('link',{name:'Check live route in Google Maps'})).toHaveCount(0);
  }
});
