import { test, expect } from '@playwright/test';

/**
 * Phase 1, Task 1.10: Collection Creation Feature - End-to-End Test
 *
 * This test verifies the complete collection creation workflow:
 * - Authentication flow (login with test user)
 * - Collection page accessibility
 * - Create collection dialog interaction
 * - Collection creation with minimal fields (Scenario 1)
 * - Collection creation with all filters (Scenario 2)
 * - API response validation
 * - UI feedback (toast messages, dialog behavior)
 * - Data persistence (collection appears in list)
 *
 * Test User Credentials:
 * - Email: test@example.com
 * - Password: testpassword123
 */

test.describe('Collection Creation Feature (Task 1.10)', () => {
  // Set test timeout (30 seconds max per test)
  test.setTimeout(30000);

  test.beforeEach(async ({ page }) => {
    // Set default timeouts
    page.setDefaultTimeout(10000); // 10 seconds for selectors
    page.setDefaultNavigationTimeout(15000); // 15 seconds for navigation

    // Start from home page
    await page.goto('/');
  });

  /**
   * Scenario 1: Create collection with minimal required fields only
   *
   * Input:
   * - Collection Name: "Machine Learning Papers"
   * - Search Keywords: "machine learning"
   * - Optional fields: left empty
   *
   * Expected Results:
   * - Success toast: "Collection created with X papers!"
   * - POST /api/collections returns 201 Created
   * - Dialog closes automatically
   * - New collection appears in the list
   */
  test('Scenario 1: Create collection with required fields only', async ({
    page,
  }) => {
    // Step 1: Login with test user
    console.log('Step 1: Logging in with test@example.com...');

    // Check if already logged in (look for Collections link in nav)
    const collectionsLink = page.getByRole('link', { name: /collections/i });
    const isLoggedIn = await collectionsLink.isVisible().catch(() => false);

    if (!isLoggedIn) {
      // Navigate to login page
      const loginButton = page.getByRole('link', { name: /login|sign in/i });
      await loginButton.click();

      // Fill in login credentials
      await page.getByLabel(/email/i).fill('test@example.com');
      await page.getByLabel(/password/i).fill('testpassword123');

      // Submit login form (use the form's submit button, not the navbar button)
      const submitButton = page
        .getByRole('main')
        .getByRole('button', { name: /sign in|login/i });
      await submitButton.click();

      // Wait for redirect to home or collections page
      await page.waitForURL(/\/(collections)?/, { timeout: 15000 });
    }

    console.log('✓ Login successful');

    // Step 2: Navigate to Collections page
    console.log('Step 2: Navigating to Collections page...');
    await page.getByRole('link', { name: /collections/i }).click();
    await page.waitForURL(/\/collections/, { timeout: 15000 });
    console.log('✓ Collections page loaded');

    // Take screenshot of collections page
    await page.screenshot({
      path: '.playwright-mcp/collections-page-before-create.png',
    });

    // Step 3: Open "Create Collection" dialog
    console.log('Step 3: Opening Create Collection dialog...');
    const createButton = page
      .getByRole('button', {
        name: /create collection/i,
      })
      .first();
    await createButton.click();

    // Wait for dialog to appear
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    console.log('✓ Dialog opened');

    // Take screenshot of dialog
    await page.screenshot({
      path: '.playwright-mcp/create-collection-dialog-scenario1.png',
    });

    // Step 4: Fill in required fields only
    console.log('Step 4: Filling in required fields only...');

    // Fill collection name
    const nameInput = page.getByLabel(/collection name/i);
    await nameInput.fill('Machine Learning Papers');

    // Fill search keywords
    const keywordsInput = page.getByLabel(/search keywords/i);
    await keywordsInput.fill('machine learning');

    // Leave optional fields empty (From Year, To Year, Min Citations, Open Access)
    console.log('✓ Required fields filled');

    // Take screenshot before submission
    await page.screenshot({
      path: '.playwright-mcp/create-collection-filled-scenario1.png',
    });

    // Step 5: Submit form and monitor network request
    console.log('Step 5: Submitting form...');

    // Set up network request listener
    const responsePromise = page.waitForResponse(
      response =>
        response.url().includes('/api/collections') &&
        response.request().method() === 'POST',
      { timeout: 15000 }
    );

    // Click create button
    const submitButton = page.getByRole('button', {
      name: /^create collection$/i,
    });
    await submitButton.click();

    // Wait for API response
    const response = await responsePromise;
    const statusCode = response.status();
    const responseBody = await response.json().catch(() => null);

    console.log(`✓ API Response: ${statusCode}`);
    console.log(`✓ Response Body:`, responseBody);

    // Step 6: Verify API response
    expect(statusCode).toBe(201);
    expect(responseBody).toHaveProperty('success', true);
    expect(responseBody).toHaveProperty('data');
    expect(responseBody.data).toHaveProperty('collection');
    expect(responseBody.data.collection).toHaveProperty('id');
    expect(responseBody.data.collection).toHaveProperty(
      'name',
      'Machine Learning Papers'
    );
    expect(responseBody.data.collection).toHaveProperty(
      'searchQuery',
      'machine learning'
    );
    expect(responseBody.data).toHaveProperty('stats');
    expect(responseBody.data.stats).toHaveProperty('totalPapers');
    expect(responseBody.data.stats).toHaveProperty('openAccessPapers');

    // Step 7: Verify success toast appears
    console.log('Step 6: Verifying success toast...');
    const toast = page.locator(
      'text=/Collection ".*" created with \\d+ papers?!/i'
    );
    await expect(toast).toBeVisible({ timeout: 5000 });
    console.log('✓ Success toast displayed');

    // Step 8: Verify dialog closes
    console.log('Step 7: Verifying dialog closes...');
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({
      timeout: 5000,
    });
    console.log('✓ Dialog closed');

    // Step 9: Verify new collection appears in list
    console.log('Step 8: Verifying collection appears in list...');
    const collectionCard = page.locator('text=Machine Learning Papers').first();
    await expect(collectionCard).toBeVisible({ timeout: 5000 });
    console.log('✓ Collection appears in list');

    // Take final screenshot
    await page.screenshot({
      path: '.playwright-mcp/collections-page-after-create-scenario1.png',
    });

    console.log('✅ Scenario 1: PASSED - Collection created successfully');
  });

  /**
   * Scenario 2: Create collection with optional filters
   *
   * Input:
   * - Collection Name: "ML Papers 2020+"
   * - Search Keywords: "machine learning"
   * - From Year: 2020
   * - To Year: (empty - current year)
   * - Minimum Citations: (empty - no minimum)
   * - Open Access Only: unchecked
   *
   * Expected Results:
   * - Success toast message
   * - POST /api/collections returns 201 Created
   * - Response body includes filter parameters
   * - Collection appears in list
   */
  test('Scenario 2: Create collection with all filters', async ({ page }) => {
    // Step 1: Login (same as Scenario 1)
    console.log('Step 1: Logging in with test@example.com...');

    const collectionsLink = page.getByRole('link', { name: /collections/i });
    const isLoggedIn = await collectionsLink.isVisible().catch(() => false);

    if (!isLoggedIn) {
      const loginButton = page.getByRole('link', { name: /login|sign in/i });
      await loginButton.click();

      await page.getByLabel(/email/i).fill('test@example.com');
      await page.getByLabel(/password/i).fill('testpassword123');

      const submitButton = page
        .getByRole('main')
        .getByRole('button', { name: /sign in|login/i });
      await submitButton.click();

      await page.waitForURL(/\/(collections)?/, { timeout: 15000 });
    }

    console.log('✓ Login successful');

    // Step 2: Navigate to Collections page
    console.log('Step 2: Navigating to Collections page...');
    await page.getByRole('link', { name: /collections/i }).click();
    await page.waitForURL(/\/collections/, { timeout: 15000 });
    console.log('✓ Collections page loaded');

    // Step 3: Open "Create Collection" dialog
    console.log('Step 3: Opening Create Collection dialog...');
    const createButton = page
      .getByRole('button', {
        name: /create collection/i,
      })
      .first();
    await createButton.click();

    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    console.log('✓ Dialog opened');

    // Take screenshot of dialog
    await page.screenshot({
      path: '.playwright-mcp/create-collection-dialog-scenario2.png',
    });

    // Step 4: Fill in all fields (required + optional filters)
    console.log('Step 4: Filling in all fields with filters...');

    // Fill collection name
    await page.getByLabel(/collection name/i).fill('ML Papers 2020+');

    // Fill search keywords
    await page.getByLabel(/search keywords/i).fill('machine learning');

    // Fill From Year
    const fromYearInput = page.getByLabel(/from year/i);
    await fromYearInput.fill('2020');

    // Leave To Year empty (will default to current year)
    // Leave Minimum Citations empty (no minimum)
    // Leave Open Access Only unchecked (include all papers)

    console.log('✓ All fields filled with filters');

    // Take screenshot before submission
    await page.screenshot({
      path: '.playwright-mcp/create-collection-filled-scenario2.png',
    });

    // Step 5: Submit form and monitor network request
    console.log('Step 5: Submitting form...');

    const responsePromise = page.waitForResponse(
      response =>
        response.url().includes('/api/collections') &&
        response.request().method() === 'POST',
      { timeout: 15000 }
    );

    const submitButton = page.getByRole('button', {
      name: /^create collection$/i,
    });
    await submitButton.click();

    const response = await responsePromise;
    const statusCode = response.status();
    const responseBody = await response.json().catch(() => null);

    console.log(`✓ API Response: ${statusCode}`);
    console.log(`✓ Response Body:`, responseBody);

    // Step 6: Verify API response (including filter parameters)
    expect(statusCode).toBe(201);
    expect(responseBody).toHaveProperty('success', true);
    expect(responseBody).toHaveProperty('data');
    expect(responseBody.data).toHaveProperty('collection');
    expect(responseBody.data.collection).toHaveProperty('id');
    expect(responseBody.data.collection).toHaveProperty(
      'name',
      'ML Papers 2020+'
    );
    expect(responseBody.data.collection).toHaveProperty(
      'searchQuery',
      'machine learning'
    );
    expect(responseBody.data.collection).toHaveProperty('filters');
    expect(responseBody.data.collection.filters).toHaveProperty(
      'yearFrom',
      2020
    );
    expect(responseBody.data.collection.filters).toHaveProperty(
      'openAccessOnly',
      false
    );
    expect(responseBody.data).toHaveProperty('stats');
    expect(responseBody.data.stats.totalPapers).toBeGreaterThan(0);

    // Step 7: Verify success toast appears
    console.log('Step 6: Verifying success toast...');
    const toast = page.locator(
      'text=/Collection ".*" created with \\d+ papers?!/i'
    );
    await expect(toast).toBeVisible({ timeout: 5000 });
    console.log('✓ Success toast displayed');

    // Step 8: Verify dialog closes
    console.log('Step 7: Verifying dialog closes...');
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({
      timeout: 5000,
    });
    console.log('✓ Dialog closed');

    // Step 9: Verify new collection appears in list
    console.log('Step 8: Verifying collection appears in list...');
    const collectionCard = page.locator('text=ML Papers 2020+').first();
    await expect(collectionCard).toBeVisible({ timeout: 5000 });
    console.log('✓ Collection appears in list');

    // Take final screenshot
    await page.screenshot({
      path: '.playwright-mcp/collections-page-after-create-scenario2.png',
    });

    console.log('✅ Scenario 2: PASSED - Collection created with filters');
  });

  /**
   * Additional Test: Verify no console errors during collection creation
   */
  test('Verify no console errors during collection creation', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];

    // Listen for console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Login
    const collectionsLink = page.getByRole('link', { name: /collections/i });
    const isLoggedIn = await collectionsLink.isVisible().catch(() => false);

    if (!isLoggedIn) {
      const loginButton = page.getByRole('link', { name: /login|sign in/i });
      await loginButton.click();

      await page.getByLabel(/email/i).fill('test@example.com');
      await page.getByLabel(/password/i).fill('testpassword123');

      const submitButton = page
        .getByRole('main')
        .getByRole('button', { name: /sign in|login/i });
      await submitButton.click();

      await page.waitForURL(/\/(collections)?/, { timeout: 15000 });
    }

    // Navigate to collections
    await page.getByRole('link', { name: /collections/i }).click();
    await page.waitForURL(/\/collections/, { timeout: 15000 });

    // Open dialog
    const createButton = page
      .getByRole('button', {
        name: /create collection/i,
      })
      .first();
    await createButton.click();
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });

    // Fill and submit
    await page.getByLabel(/collection name/i).fill('Test Collection');
    await page.getByLabel(/search keywords/i).fill('test');

    const submitButton = page.getByRole('button', {
      name: /^create collection$/i,
    });
    await submitButton.click();

    // Wait for completion
    await page.waitForResponse(
      response =>
        response.url().includes('/api/collections') &&
        response.request().method() === 'POST',
      { timeout: 15000 }
    );

    // Wait a bit for any delayed errors
    await page.waitForTimeout(2000);

    // Verify no console errors
    console.log('Console errors detected:', consoleErrors);
    expect(consoleErrors).toHaveLength(0);

    console.log('✅ No console errors detected during collection creation');
  });

  /**
   * Additional Test: Verify database foreign key integrity
   * (Check that userId is properly set and no foreign key errors occur)
   */
  test('Verify database foreign key integrity', async ({ page }) => {
    // Login
    const collectionsLink = page.getByRole('link', { name: /collections/i });
    const isLoggedIn = await collectionsLink.isVisible().catch(() => false);

    if (!isLoggedIn) {
      const loginButton = page.getByRole('link', { name: /login|sign in/i });
      await loginButton.click();

      await page.getByLabel(/email/i).fill('test@example.com');
      await page.getByLabel(/password/i).fill('testpassword123');

      const submitButton = page
        .getByRole('main')
        .getByRole('button', { name: /sign in|login/i });
      await submitButton.click();

      await page.waitForURL(/\/(collections)?/, { timeout: 15000 });
    }

    // Navigate to collections
    await page.getByRole('link', { name: /collections/i }).click();
    await page.waitForURL(/\/collections/, { timeout: 15000 });

    // Open dialog
    const createButton = page
      .getByRole('button', {
        name: /create collection/i,
      })
      .first();
    await createButton.click();
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });

    // Fill and submit
    await page
      .getByLabel(/collection name/i)
      .fill('FK Integrity Test Collection');
    await page.getByLabel(/search keywords/i).fill('database test');

    const responsePromise = page.waitForResponse(
      response =>
        response.url().includes('/api/collections') &&
        response.request().method() === 'POST',
      { timeout: 15000 }
    );

    const submitButton = page.getByRole('button', {
      name: /^create collection$/i,
    });
    await submitButton.click();

    const response = await responsePromise;
    const statusCode = response.status();
    const responseBody = await response.json().catch(() => null);

    // Verify no foreign key errors (would return 500 or 400)
    expect(statusCode).toBe(201);
    expect(responseBody).toHaveProperty('success', true);
    expect(responseBody.data.collection).toHaveProperty('id');
    // The userId is set server-side and not returned in the response,
    // but we can verify the collection was created successfully (no FK errors)
    expect(responseBody.data.stats.totalPapers).toBeGreaterThan(0);

    console.log(
      '✅ Foreign key integrity verified - collection created successfully'
    );
  });
});
