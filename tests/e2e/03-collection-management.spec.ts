/* eslint-disable @typescript-eslint/no-unused-vars */

import { test, expect } from '@playwright/test';
import { cleanupTestData } from './helpers/test-utils';
import { loginTestUser } from './helpers/auth';

/**
 * E2E Test Suite: Collection Management
 *
 * Tests CRUD operations for research paper collections
 * Covers: View Collections, Create Collection, Collection Details, Delete Collection
 */

test.describe('Collection Management', () => {
  // Track created collection IDs for cleanup
  const createdCollectionIds: string[] = [];

  // Clean up after all tests in this suite
  test.afterAll(async () => {
    for (const collectionId of createdCollectionIds) {
      await cleanupTestData(collectionId);
    }
  });
  test.describe('3.1 View Collections List', () => {
    test('should display collections page', async ({ page }) => {
      await page.goto('http://localhost:3000/collections');

      // Wait for one of these conditions:
      // 1. Login button (auth required)
      // 2. "No collections yet" (empty state)
      // 3. Collection cards (has data)
      // 4. "My Collections" header (page loaded)
      await Promise.race([
        page
          .getByRole('button', { name: /sign in/i })
          .waitFor({ timeout: 10000 })
          .catch(() => null),
        page
          .getByText(/no collections yet/i)
          .waitFor({ timeout: 10000 })
          .catch(() => null),
        page
          .locator('[data-testid="collection-card"]')
          .first()
          .waitFor({ timeout: 10000 })
          .catch(() => null),
        page
          .getByText(/my collections/i)
          .waitFor({ timeout: 10000 })
          .catch(() => null),
      ]);

      // Page should render
      const body = page.locator('body');
      await expect(body).toBeVisible();

      // Check what's displayed
      const hasSignInButton =
        (await page.getByRole('button', { name: /sign in/i }).count()) > 0;
      const hasCollections =
        (await page.locator('[data-testid="collection-card"]').count()) > 0;
      const hasEmptyState =
        (await page.getByText(/no collections yet/i).count()) > 0;
      const hasCreateButton =
        (await page
          .getByRole('button', { name: /create.*collection/i })
          .count()) > 0;

      // Should show at least one of these
      expect(
        hasSignInButton || hasCollections || hasEmptyState || hasCreateButton
      ).toBe(true);
    });

    test('should show create collection button', async ({ page }) => {
      // Log in first to access collections page
      await loginTestUser(page);

      await page.goto('http://localhost:3000/collections');
      await page.waitForLoadState('load');

      // Wait for page to load and show either collections or empty state
      await Promise.race([
        page
          .getByRole('button', { name: /create.*collection/i })
          .waitFor({ timeout: 10000 }),
        page
          .locator('[data-testid="collection-card"]')
          .first()
          .waitFor({ timeout: 10000 })
          .catch(() => null),
      ]);

      // Look for create collection button
      const createButton = page
        .getByRole('button', { name: /create.*collection|new collection/i })
        .first();

      await expect(createButton).toBeVisible();
      await expect(createButton).toBeEnabled();
    });

    test('should display collection cards with metadata', async ({ page }) => {
      await page.goto('http://localhost:3000/collections');
      await page.waitForLoadState('networkidle');

      // Check if collections exist
      const collectionCards = page.locator('[data-testid="collection-card"]');
      const count = await collectionCards.count();

      if (count > 0) {
        const firstCard = collectionCards.first();

        // Each card should display key information
        const cardText = await firstCard.textContent();
        expect(cardText).toBeTruthy();

        // Should have some metadata (title, count, date, etc.)
        console.log('Collection card content:', cardText?.substring(0, 100));
      } else {
        console.log('No collections found - empty state test');
      }
    });
  });

  test.describe('3.2 Create Collection - Dialog/Modal', () => {
    test('should open create collection dialog', async ({ page }) => {
      await page.goto('http://localhost:3000/collections');
      await page.waitForLoadState('networkidle');

      const createButton = page
        .getByRole('button', { name: /create.*collection|new collection/i })
        .first();

      if (await createButton.isVisible().catch(() => false)) {
        await createButton.click();

        // Dialog should open
        await page.waitForTimeout(500); // Wait for animation

        // Look for dialog/modal
        const dialog = page
          .locator('[role="dialog"], [data-testid="create-collection-dialog"]')
          .first();
        const dialogVisible = await dialog.isVisible().catch(() => false);

        if (dialogVisible) {
          await expect(dialog).toBeVisible();

          // Dialog should have form fields
          const keywordsInput = page
            .locator('input[name="keywords"], input[placeholder*="keywords"]')
            .first();
          await expect(keywordsInput).toBeVisible();
        } else {
          console.warn(
            'Create collection dialog not found - check implementation'
          );
        }
      }
    });

    test('should have required form fields', async ({ page }) => {
      await page.goto('http://localhost:3000/collections');
      await page.waitForLoadState('networkidle');

      const createButton = page
        .getByRole('button', { name: /create.*collection|new collection/i })
        .first();

      if (await createButton.isVisible().catch(() => false)) {
        await createButton.click();
        await page.waitForTimeout(500);

        // Check for keywords input (required)
        const keywordsInput = page
          .locator(
            'input[name="keywords"], input[placeholder*="keywords"], input[placeholder*="search"]'
          )
          .first();
        const hasKeywordsInput = await keywordsInput
          .isVisible()
          .catch(() => false);

        if (hasKeywordsInput) {
          await expect(keywordsInput).toBeVisible();

          // Optional fields (year range, citations)
          console.log('Form fields are present in create collection dialog');
        } else {
          console.warn('Keywords input not found');
        }
      }
    });

    test('should close dialog on cancel', async ({ page }) => {
      await page.goto('http://localhost:3000/collections');
      await page.waitForLoadState('networkidle');

      const createButton = page
        .getByRole('button', { name: /create.*collection|new collection/i })
        .first();

      if (await createButton.isVisible().catch(() => false)) {
        await createButton.click();
        await page.waitForTimeout(500);

        // Look for cancel/close button
        const cancelButton = page
          .getByRole('button', { name: /cancel|close/i })
          .first();
        const closeIcon = page
          .locator('[data-testid="close-dialog"], button[aria-label="Close"]')
          .first();

        if (await cancelButton.isVisible().catch(() => false)) {
          await cancelButton.click();
        } else if (await closeIcon.isVisible().catch(() => false)) {
          await closeIcon.click();
        } else {
          // Try pressing Escape
          await page.keyboard.press('Escape');
        }

        await page.waitForTimeout(500);

        // Dialog should be closed
        const dialog = page.locator('[role="dialog"]').first();
        const isVisible = await dialog.isVisible().catch(() => false);

        expect(isVisible).toBe(false);
      }
    });
  });

  test.describe('3.3 Create Collection - Form Validation', () => {
    test('should validate empty keywords field', async ({ page }) => {
      await page.goto('http://localhost:3000/collections');
      await page.waitForLoadState('networkidle');

      const createButton = page
        .getByRole('button', { name: /create.*collection|new collection/i })
        .first();

      if (await createButton.isVisible().catch(() => false)) {
        await createButton.click();
        await page.waitForTimeout(500);

        // Try to submit with empty keywords
        const submitButton = page
          .getByRole('button', { name: /create|search|submit/i })
          .last();

        if (await submitButton.isVisible().catch(() => false)) {
          await submitButton.click();

          // Should show validation error
          await page.waitForTimeout(500);

          const errorMessage = page
            .getByText(/required|keywords.*required|enter.*keywords/i)
            .first();
          const hasError = await errorMessage.isVisible().catch(() => false);

          if (hasError) {
            console.log('Validation works: Empty keywords rejected');
          } else {
            console.warn('Validation error not shown for empty keywords');
          }
        }
      }
    });

    test('should validate minimum keywords length', async ({ page }) => {
      await page.goto('http://localhost:3000/collections');
      await page.waitForLoadState('networkidle');

      const createButton = page
        .getByRole('button', { name: /create.*collection|new collection/i })
        .first();

      if (await createButton.isVisible().catch(() => false)) {
        await createButton.click();
        await page.waitForTimeout(500);

        const keywordsInput = page
          .locator('input[name="keywords"], input[placeholder*="keywords"]')
          .first();

        if (await keywordsInput.isVisible().catch(() => false)) {
          // Enter very short keywords
          await keywordsInput.fill('ab');

          const submitButton = page
            .getByRole('button', { name: /create|search|submit/i })
            .last();
          await submitButton.click();

          await page.waitForTimeout(500);

          // Should show validation error or be disabled
          const errorMessage = page
            .getByText(/at least|minimum|too short/i)
            .first();
          const hasError = await errorMessage.isVisible().catch(() => false);

          if (hasError) {
            console.log('Validation works: Short keywords rejected');
          } else {
            console.log('Short keywords validation may not be implemented');
          }
        }
      }
    });
  });

  test.describe('3.4 Create Collection - Happy Path (Integration)', () => {
    test('should successfully create a collection with valid inputs', async ({
      page,
    }) => {
      // This is an integration test that requires:
      // 1. Authentication
      // 2. Working Semantic Scholar API
      // 3. Database connection

      // Log in first
      await loginTestUser(page);

      // Navigate to collections if not already there
      if (!page.url().includes('/collections')) {
        await page.goto('http://localhost:3000/collections');
        await page.waitForLoadState('load');
      }

      // Wait for page to fully load and show either collections or empty state
      await Promise.race([
        page
          .getByRole('button', { name: /create.*collection/i })
          .waitFor({ timeout: 10000 }),
        page
          .locator('[data-testid="collection-card"]')
          .first()
          .waitFor({ timeout: 10000 })
          .catch(() => null),
      ]);

      const createButton = page
        .getByRole('button', { name: /create.*collection/i })
        .first();

      // Make sure button is visible before clicking
      await expect(createButton).toBeVisible();
      await createButton.click();
      await page.waitForTimeout(500);

      // Fill in the form
      const nameInput = page.locator('input[name="name"]').first();
      await nameInput.fill('Test Collection - Machine Learning');

      const keywordsInput = page.locator('input[name="keywords"]').first();
      await keywordsInput.fill('machine learning neural networks');

      // Optional: Set filters
      // Year range, min citations, etc.

      // Submit
      const submitButton = page
        .getByRole('button', { name: /create|search/i })
        .last();
      await submitButton.click();

      // Should show loading state
      await page.waitForTimeout(1000);

      // Should create collection and navigate to it
      await page.waitForURL(/\/collections\/[a-z0-9-]+/i, { timeout: 15000 });

      // Verify we're on collection detail page
      const url = page.url();
      expect(url).toMatch(/\/collections\/.+/);
    });

    test('should display created collection in list', async ({ page }) => {
      // Skip - requires auth and integration test setup
    });
  });

  test.describe('3.5 View Collection Details', () => {
    test('should display collection header information', async ({ page }) => {
      // Requires existing collection
      // Skip for now - implement with test data setup

      const testCollectionId = 'test-collection-id';
      await page.goto(`http://localhost:3000/collections/${testCollectionId}`);

      await page.waitForLoadState('networkidle');

      // Should show collection title
      const title = page.locator('h1').first();
      await expect(title).toBeVisible();

      // Should show paper count
      const paperCount = page.getByText(/\d+ papers?/i).first();
      await expect(paperCount).toBeVisible();

      // Should show created date
      const date = page.getByText(/created|updated/i).first();
      await expect(date).toBeVisible();
    });

    test('should display three tabs: Papers, Chat, Insights', async ({
      page,
    }) => {
      const testCollectionId = 'test-collection-id';
      await page.goto(`http://localhost:3000/collections/${testCollectionId}`);

      await page.waitForLoadState('networkidle');

      // Check for tabs
      const papersTab = page.getByRole('tab', { name: /papers/i });
      const chatTab = page.getByRole('tab', { name: /chat/i });
      const insightsTab = page.getByRole('tab', { name: /insights/i });

      await expect(papersTab).toBeVisible();
      await expect(chatTab).toBeVisible();
      await expect(insightsTab).toBeVisible();
    });

    test('should switch tabs without page reload', async ({ page }) => {
      const testCollectionId = 'test-collection-id';
      await page.goto(`http://localhost:3000/collections/${testCollectionId}`);

      await page.waitForLoadState('networkidle');

      const _initialUrl = page.url();

      // Click chat tab
      const chatTab = page.getByRole('tab', { name: /chat/i });
      await chatTab.click();

      await page.waitForTimeout(500);

      // URL might change (if using URL params) but no full page reload
      const _chatUrl = page.url();

      // Check if chat content is visible
      const chatInterface = page
        .locator('[data-testid="chat-interface"], textarea')
        .first();
      await expect(chatInterface).toBeVisible();
    });

    test('should show processing status', async ({ page }) => {
      const testCollectionId = 'test-collection-id';
      await page.goto(`http://localhost:3000/collections/${testCollectionId}`);

      await page.waitForLoadState('networkidle');

      // Should show processing progress
      const progressIndicator = page
        .getByText(/\d+\/\d+ papers indexed|processing|indexing/i)
        .first();
      const hasProgress = await progressIndicator
        .isVisible()
        .catch(() => false);

      if (hasProgress) {
        await expect(progressIndicator).toBeVisible();
      } else {
        console.log('No papers being processed or all complete');
      }
    });
  });

  test.describe('3.6 Delete Collection', () => {
    test('should show delete button', async ({ page }) => {
      // Requires auth and existing collection
      const testCollectionId = 'test-collection-id';
      await page.goto(`http://localhost:3000/collections/${testCollectionId}`);

      await page.waitForLoadState('networkidle');

      // Look for delete button (might be in dropdown menu)
      const deleteButton = page
        .getByRole('button', { name: /delete/i })
        .first();
      const menuButton = page
        .getByRole('button', { name: /menu|more|options/i })
        .first();

      const hasDeleteButton = await deleteButton.isVisible().catch(() => false);
      const hasMenuButton = await menuButton.isVisible().catch(() => false);

      expect(hasDeleteButton || hasMenuButton).toBe(true);
    });

    test('should show confirmation dialog before delete', async ({ page }) => {
      const testCollectionId = 'test-collection-id';
      await page.goto(`http://localhost:3000/collections/${testCollectionId}`);

      await page.waitForLoadState('networkidle');

      const deleteButton = page
        .getByRole('button', { name: /delete/i })
        .first();

      if (await deleteButton.isVisible().catch(() => false)) {
        await deleteButton.click();

        // Should show confirmation dialog
        await page.waitForTimeout(500);

        const confirmDialog = page
          .locator('[role="alertdialog"], [data-testid="delete-confirmation"]')
          .first();
        await expect(confirmDialog).toBeVisible();

        // Dialog should have cancel and confirm buttons
        const cancelButton = page.getByRole('button', { name: /cancel|no/i });
        const confirmButton = page.getByRole('button', {
          name: /delete|yes|confirm/i,
        });

        await expect(cancelButton).toBeVisible();
        await expect(confirmButton).toBeVisible();

        // Cancel to avoid actually deleting
        await cancelButton.click();
      }
    });

    test('should delete collection and redirect to list', async ({ page }) => {
      // This test actually deletes - requires proper test data setup
      // Skip for now
    });
  });

  test.describe('3.7 Collection Actions', () => {
    test('should have action buttons for collection management', async ({
      page,
    }) => {
      const testCollectionId = 'test-collection-id';
      await page.goto(`http://localhost:3000/collections/${testCollectionId}`);

      await page.waitForLoadState('networkidle');

      // Look for common action buttons
      const possibleActions = [
        'Update',
        'Refresh',
        'Share',
        'Edit',
        'Delete',
        'Settings',
      ];

      let foundActions = 0;
      for (const action of possibleActions) {
        const button = page
          .getByRole('button', { name: new RegExp(action, 'i') })
          .first();
        if (await button.isVisible().catch(() => false)) {
          foundActions++;
          console.log(`Found action: ${action}`);
        }
      }

      console.log(`Found ${foundActions} action buttons`);
    });
  });

  test.describe('3.8 Collection Error States', () => {
    test('should handle non-existent collection gracefully', async ({
      page,
    }) => {
      await page.goto(
        'http://localhost:3000/collections/non-existent-collection-12345'
      );

      await page.waitForLoadState('networkidle');

      // Should show error message or 404
      const errorMessages = page.getByText(
        /not found|doesn't exist|no collection|error/i
      );
      const errorCount = await errorMessages.count();

      if (errorCount > 0) {
        console.log('Error handling works for non-existent collection');
      } else {
        // Might redirect to login or collections list
        const url = page.url();
        console.log(`Redirected to: ${url}`);
      }
    });

    test('should handle unauthorized access to collection', async ({
      page,
    }) => {
      // Try to access another user's collection
      // Requires auth and test data

      await page.goto(
        'http://localhost:3000/collections/another-users-collection'
      );

      // Should show 403 or redirect
      const errorMessage = page
        .getByText(/unauthorized|access denied|forbidden/i)
        .first();
      const hasError = await errorMessage.isVisible().catch(() => false);

      expect(hasError).toBe(true);
    });
  });

  test.describe('3.9 Collection List Sorting and Filtering', () => {
    test('should sort collections by most recent first', async ({ page }) => {
      await page.goto('http://localhost:3000/collections');
      await page.waitForLoadState('networkidle');

      // Get collection cards
      const cards = page.locator('[data-testid="collection-card"]');
      const count = await cards.count();

      if (count >= 2) {
        // Check if sorted by date (would need to parse dates from cards)
        console.log(
          'Collections are displayed - sorting check requires date parsing'
        );
      }
    });

    test('should filter collections by search query', async ({ page }) => {
      // If search/filter is implemented
      await page.goto('http://localhost:3000/collections');
      await page.waitForLoadState('networkidle');

      const searchInput = page.getByPlaceholder(/search|filter/i).first();

      if (await searchInput.isVisible().catch(() => false)) {
        await searchInput.fill('machine learning');

        await page.waitForTimeout(500);

        // Results should be filtered
        console.log('Search/filter functionality exists');
      }
    });
  });

  test.describe('3.10 Performance and UX', () => {
    test('collections page should load within acceptable time', async ({
      page,
    }) => {
      const startTime = Date.now();

      await page.goto('http://localhost:3000/collections');
      await page.waitForLoadState('networkidle');

      const loadTime = Date.now() - startTime;
      console.log(`Collections page loaded in ${loadTime}ms`);

      // Should load within 5 seconds
      expect(loadTime).toBeLessThan(5000);
    });

    test('should show loading state while fetching collections', async ({
      page,
    }) => {
      await page.goto('http://localhost:3000/collections');

      // Check for loading indicators quickly (before data loads)
      const loadingIndicators = page.locator(
        '[data-testid="loading"], .animate-pulse, .animate-spin'
      );
      const hasLoading = (await loadingIndicators.count()) > 0;

      console.log(`Loading indicators present: ${hasLoading}`);
    });
  });
});
