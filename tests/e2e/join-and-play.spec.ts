import { test, expect } from '@playwright/test';

// Quick e2e flows: join and a full 3-player round where Alice wins

test('create room and let others join', async ({ browser }) => {
  const pageA = await browser.newPage();
  await pageA.goto('/');

  await pageA.fill('input[placeholder="Choose an alias"]', 'Alice');
  await pageA.click('button:has-text("New room")');

  // wait for lobby and room code
  const roomCodeLocator = pageA.locator('text=/CON-[A-Z0-9]{6}/');
  await expect(roomCodeLocator).toHaveCount(1);
  const code = (await roomCodeLocator.first().innerText()).trim();
  expect(code.startsWith('CON-')).toBeTruthy();

  const pageB = await browser.newPage();
  await pageB.goto('/');
  await pageB.fill('input[placeholder="Choose an alias"]', 'Bob');
  await pageB.fill('input[placeholder="Code"]', code);
  await pageB.click('button:has-text("Join room")');

  const pageC = await browser.newPage();
  await pageC.goto('/');
  await pageC.fill('input[placeholder="Choose an alias"]', 'Charlie');
  await pageC.fill('input[placeholder="Code"]', code);
  await pageC.click('button:has-text("Join room")');

  // ensure all pages show the joined players
  await expect(pageA.locator('text=Bob')).toBeVisible();
  await expect(pageA.locator('text=Charlie')).toBeVisible();
  await expect(pageB.locator('text=Alice')).toBeVisible();
  await expect(pageC.locator('text=Alice')).toBeVisible();

  await pageA.close();
  await pageB.close();
  await pageC.close();
});

test('full round: three players submit and vote (Alice wins)', async ({ browser }) => {
  const pageA = await browser.newPage();
  await pageA.goto('/');
  await pageA.fill('input[placeholder="Choose an alias"]', 'Alice');
  await pageA.click('button:has-text("New room")');

  const roomCodeLocator = pageA.locator('text=/CON-[A-Z0-9]{6}/');
  await expect(roomCodeLocator).toHaveCount(1);
  const code = (await roomCodeLocator.first().innerText()).trim();

  const pageB = await browser.newPage();
  await pageB.goto('/');
  await pageB.fill('input[placeholder="Choose an alias"]', 'Bob');
  await pageB.fill('input[placeholder="Code"]', code);
  await pageB.click('button:has-text("Join room")');

  const pageC = await browser.newPage();
  await pageC.goto('/');
  await pageC.fill('input[placeholder="Choose an alias"]', 'Charlie');
  await pageC.fill('input[placeholder="Code"]', code);
  await pageC.click('button:has-text("Join room")');

  // Start round as Alice (creator should be chooser)
  await expect(pageA.locator('button:has-text("Start round")')).toBeEnabled();
  await pageA.click('button:has-text("Start round")');

  // As chooser, pick first topic suggestion
  const suggestionBtn = pageA.locator('button').filter({ hasText: /[A-Za-z ].{10,}/ }).first();
  await suggestionBtn.click();

  // Wait for writing phase on all pages
  await expect(pageA.locator('textarea[placeholder^="Write the most ridiculous"]')).toBeVisible();
  await expect(pageB.locator('textarea[placeholder^="Write the most ridiculous"]')).toBeVisible();
  await expect(pageC.locator('textarea[placeholder^="Write the most ridiculous"]')).toBeVisible();

  // Submit in order: Alice, Bob, Charlie so Theory 1 is Alice's
  await pageA.fill('textarea[placeholder^="Write the most ridiculous"]', 'Alice theory');
  await pageA.click('button:has-text("Submit theory")');

  await pageB.fill('textarea[placeholder^="Write the most ridiculous"]', 'Bob theory');
  await pageB.click('button:has-text("Submit theory")');

  await pageC.fill('textarea[placeholder^="Write the most ridiculous"]', 'Charlie theory');
  await pageC.click('button:has-text("Submit theory")');

  // Wait for voting phase: buttons labeled 'Theory 1' etc.
  await expect(pageB.locator('button:has-text("Theory 1")')).toBeVisible();
  await expect(pageC.locator('button:has-text("Theory 1")')).toBeVisible();

  // Bob and Charlie vote for Theory 1 (Alice)
  await pageB.click('button:has-text("Theory 1")');
  await pageC.click('button:has-text("Theory 1")');
  await pageA.click('button:has-text("Theory 2")'); // Alice can vote too, but it doesn't matter

  // Wait for results
  await expect(pageA.locator('text=Round winner')).toBeVisible();
  await expect(pageA.getByText('Round winnerAlice')).toBeVisible();

  // Leaderboard shows Alice with at least 1 point
  await expect(pageA.getByText('🕵️Alice1')).toBeVisible();

  await pageA.close();
  await pageB.close();
  await pageC.close();
});
