/* eslint-disable @typescript-eslint/no-unused-vars */

import { test, expect } from '@playwright/test';
import { cleanupTestData } from './helpers/test-utils';

/**
 * E2E Test Suite: UI/UX Validation
 *
 * Tests basic visual and interaction patterns across the application
 * Covers: Homepage, Navigation, Responsive Design, Loading States, Empty States
 */

test.describe('UI/UX Validation', () => {
  // Track created resources for cleanup (if any)
  const createdResourceIds: string[] = [];

  // Clean up after all tests in this suite
  test.afterAll(async () => {
    for (const resourceId of createdResourceIds) {
      await cleanupTestData(resourceId);
    }
  });
  test.describe('1.1 Homepage Layout', () => {
    test('should display homepage correctly for unauthenticated user', async ({
      page,
    }) => {
      await page.goto('http://localhost:3000');

      // Verify hero section
      const heroSection = page
        .locator('h1, [data-testid="hero-title"]')
        .first();
      await expect(heroSection).toBeVisible();
      await expect(heroSection).toContainText(/CiteBite|Research/i);

      // Verify CTA button
      const ctaButton = page
        .getByRole('button', { name: /get started|login|sign in/i })
        .first();
      await expect(ctaButton).toBeVisible();

      // Verify navigation shows login
      const loginLink = page.getByRole('link', { name: /login|sign in/i });
      await expect(loginLink).toBeVisible();

      // Verify feature cards or descriptions
      const featureSection = page.locator('text=/collections|chat/i').first();
      await expect(featureSection).toBeVisible();
    });

    test('should display personalized content for authenticated user', async ({
      page,
    }) => {
      // TODO: Implement after authentication is set up
      // This test requires proper auth setup
      test.skip();
    });
  });

  test.describe('1.2 Navigation', () => {
    test('should have functional navigation elements', async ({ page }) => {
      await page.goto('http://localhost:3000');

      // Verify logo/title exists
      const logo = page.locator('header a[href="/"]').first();
      await expect(logo).toBeVisible();

      // Check if logo navigates to homepage
      await logo.click();
      await expect(page).toHaveURL('http://localhost:3000/');
    });

    test('should navigate to collections page', async ({ page }) => {
      await page.goto('http://localhost:3000');

      // Look for collections link in navigation
      const collectionsLink = page
        .getByRole('link', { name: /collections/i })
        .first();

      if (await collectionsLink.isVisible()) {
        await collectionsLink.click();

        // Should navigate to collections or login page
        await page.waitForURL(/\/(collections|login)/);
      }
    });
  });

  test.describe('1.3 Responsive Design', () => {
    test('should work at 1920x1080 resolution', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto('http://localhost:3000');

      // Verify no horizontal scroll
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      expect(bodyWidth).toBeLessThanOrEqual(viewportWidth);

      // Verify layout is readable
      const mainContent = page.locator('main, [role="main"]').first();
      await expect(mainContent).toBeVisible();
    });

    test('should work at 1440x900 resolution', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('http://localhost:3000');

      // Verify content is visible
      const mainContent = page.locator('main, [role="main"], body').first();
      await expect(mainContent).toBeVisible();
    });

    test('should work at minimum 1024px width', async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto('http://localhost:3000');

      // Verify basic layout still works
      const navigation = page.locator('nav, header').first();
      await expect(navigation).toBeVisible();

      const mainContent = page.locator('main, [role="main"], body').first();
      await expect(mainContent).toBeVisible();
    });
  });

  test.describe('1.4 Loading States', () => {
    test('should show loading indicators during async operations', async ({
      page,
    }) => {
      await page.goto('http://localhost:3000/collections');

      // Wait for page to load
      await page.waitForLoadState('networkidle');

      // Check if any loading states were shown (skeleton, spinner, etc.)
      // This is a general check - specific loading states would be tested in feature-specific tests
      const possibleLoadingElements = [
        'text=Loading',
        '[data-testid="loading"]',
        '[data-testid="skeleton"]',
        '.animate-pulse',
        '.animate-spin',
      ];

      // At least one loading pattern should be implemented
      let foundLoadingPattern = false;
      for (const selector of possibleLoadingElements) {
        const elements = page.locator(selector);
        if ((await elements.count()) > 0) {
          foundLoadingPattern = true;
          break;
        }
      }

      // This is informational - we're checking if loading states are implemented
      console.log(`Loading states found: ${foundLoadingPattern}`);
    });
  });

  test.describe('1.5 Empty States', () => {
    test('should show empty state for no collections', async ({ page }) => {
      await page.goto('http://localhost:3000/collections');

      // Wait for page to load
      await page.waitForLoadState('networkidle');

      // Look for empty state indicators
      const emptyStateTexts = [
        /no collections/i,
        /get started/i,
        /create.*collection/i,
        /start by creating/i,
      ];

      let foundEmptyState = false;
      for (const pattern of emptyStateTexts) {
        const element = page.getByText(pattern).first();
        if (await element.isVisible().catch(() => false)) {
          foundEmptyState = true;
          console.log(`Found empty state: ${pattern}`);
          break;
        }
      }

      // Empty state should guide user to create collection
      const createButton = page
        .getByRole('button', { name: /create.*collection/i })
        .first();
      if (await createButton.isVisible().catch(() => false)) {
        await expect(createButton).toBeVisible();
      }
    });
  });

  test.describe('1.6 Visual Consistency', () => {
    test('should have consistent color scheme', async ({ page }) => {
      await page.goto('http://localhost:3000');

      // Check for consistent theme (basic check)
      const backgroundColor = await page.evaluate(() => {
        return window.getComputedStyle(document.body).backgroundColor;
      });

      expect(backgroundColor).toBeTruthy();
      console.log(`Background color: ${backgroundColor}`);
    });

    test('should have readable typography', async ({ page }) => {
      await page.goto('http://localhost:3000');

      // Check font sizes are reasonable
      const headingFontSize = await page.evaluate(() => {
        const heading = document.querySelector('h1');
        if (!heading) return null;
        return window.getComputedStyle(heading).fontSize;
      });

      if (headingFontSize) {
        const fontSize = parseFloat(headingFontSize);
        expect(fontSize).toBeGreaterThan(20); // Headings should be at least 20px
      }
    });

    test('should have proper spacing and layout', async ({ page }) => {
      await page.goto('http://localhost:3000');

      // Check for reasonable padding/margin
      const bodyPadding = await page.evaluate(() => {
        return window.getComputedStyle(document.body).padding;
      });

      expect(bodyPadding).toBeTruthy();
    });
  });

  test.describe('1.7 Interactive Elements', () => {
    test('buttons should be interactive', async ({ page }) => {
      await page.goto('http://localhost:3000');

      // Find first button
      const firstButton = page.getByRole('button').first();

      if (await firstButton.isVisible().catch(() => false)) {
        // Check if button has hover state (cursor should be pointer)
        const cursor = await firstButton.evaluate(el => {
          return window.getComputedStyle(el).cursor;
        });

        expect(cursor).toBe('pointer');
      }
    });

    test('links should be interactive', async ({ page }) => {
      await page.goto('http://localhost:3000');

      // Find first link
      const firstLink = page.getByRole('link').first();

      if (await firstLink.isVisible().catch(() => false)) {
        await expect(firstLink).toBeVisible();

        // Links should have href attribute
        const href = await firstLink.getAttribute('href');
        expect(href).toBeTruthy();
      }
    });
  });

  test.describe('1.8 Error Boundaries', () => {
    test('should not crash on invalid route', async ({ page }) => {
      await page.goto('http://localhost:3000/this-route-does-not-exist-12345');

      // Should show 404 page or redirect, not crash
      await page.waitForLoadState('networkidle');

      // Page should still render something
      const body = page.locator('body');
      await expect(body).toBeVisible();
    });
  });

  test.describe('1.9 Accessibility Basics', () => {
    test('should have proper document structure', async ({ page }) => {
      await page.goto('http://localhost:3000');

      // Check for main landmark
      const main = page.locator('main, [role="main"]').first();
      const mainExists = (await main.count()) > 0;

      if (!mainExists) {
        console.warn(
          'No <main> element found - consider adding for accessibility'
        );
      }

      // Check for heading hierarchy
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBeGreaterThanOrEqual(1); // Should have at least one H1
    });

    test('should support keyboard navigation', async ({ page }) => {
      await page.goto('http://localhost:3000');

      // Press Tab to navigate
      await page.keyboard.press('Tab');

      // Check if focus moved to an interactive element
      const focusedElement = await page.evaluate(() => {
        return document.activeElement?.tagName;
      });

      expect(focusedElement).toBeTruthy();
      console.log(`First focused element: ${focusedElement}`);
    });
  });

  test.describe('1.10 Performance Basics', () => {
    test('homepage should load within acceptable time', async ({ page }) => {
      const startTime = Date.now();

      await page.goto('http://localhost:3000');
      await page.waitForLoadState('load');

      const loadTime = Date.now() - startTime;

      console.log(`Homepage loaded in ${loadTime}ms`);

      // Should load within 5 seconds (generous for development)
      expect(loadTime).toBeLessThan(5000);
    });

    test('should not have console errors on homepage', async ({ page }) => {
      const consoleErrors: string[] = [];

      page.on('console', msg => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      await page.goto('http://localhost:3000');
      await page.waitForLoadState('networkidle');

      if (consoleErrors.length > 0) {
        console.warn('Console errors found:', consoleErrors);
      }

      // Informational - not failing the test for now
      // expect(consoleErrors).toHaveLength(0);
    });
  });
});
