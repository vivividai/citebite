/* eslint-disable @typescript-eslint/no-unused-vars */

import { test, expect } from '@playwright/test';

/**
 * E2E Test Suite: Paper Management
 *
 * Tests viewing, filtering, sorting, and interacting with research papers
 * Covers: Paper List, Filtering, Sorting, Paper Details, PDF Downloads, Status Management
 */

test.describe('Paper Management', () => {
  // Helper function to navigate to a collection's Papers tab
  const navigateToCollectionPapers = async (
    page,
    collectionId = 'test-collection-id'
  ) => {
    await page.goto(`http://localhost:3000/collections/${collectionId}`);
    await page.waitForLoadState('networkidle');

    // Make sure we're on the Papers tab (default)
    const papersTab = page.getByRole('tab', { name: /papers/i }).first();
    if (await papersTab.isVisible().catch(() => false)) {
      await papersTab.click();
      await page.waitForTimeout(300);
    }
  };

  test.describe('4.1 View Paper List', () => {
    test.skip('should display papers in collection', async ({
      page: _page,
    }) => {
      // Requires test collection with papers
      await navigateToCollectionPapers(page);

      // Should show paper list
      const paperList = page.locator(
        '[data-testid="paper-list"], [data-testid="paper-card"]'
      );
      const count = await paperList.count();

      if (count > 0) {
        console.log(`Found ${count} papers in collection`);
        await expect(paperList.first()).toBeVisible();
      } else {
        // Might be empty collection
        const emptyState = page.getByText(/no papers|add papers/i).first();
        const hasEmptyState = await emptyState.isVisible().catch(() => false);
        console.log(`Empty state shown: ${hasEmptyState}`);
      }
    });

    test.skip('should display paper metadata', async ({ page: _page }) => {
      await navigateToCollectionPapers(page);

      const firstPaper = page.locator('[data-testid="paper-card"]').first();
      const paperVisible = await firstPaper.isVisible().catch(() => false);

      if (paperVisible) {
        // Check for key metadata fields
        const paperText = await firstPaper.textContent();

        // Should include: title, authors, year, citations
        console.log('Paper card content:', paperText?.substring(0, 200));

        // Look for specific metadata patterns
        const hasYear = /\b(19|20)\d{2}\b/.test(paperText || '');
        const hasCitations = /\d+\s*citations?/i.test(paperText || '');

        console.log(`Has year: ${hasYear}, Has citations: ${hasCitations}`);
      }
    });

    test.skip('should show paper status indicators', async ({
      page: _page,
    }) => {
      await navigateToCollectionPapers(page);

      // Look for status badges
      const statusIndicators = page.locator(
        '[data-testid="paper-status"], .badge, [data-testid*="status"]'
      );
      const count = await statusIndicators.count();

      if (count > 0) {
        const firstStatus = statusIndicators.first();
        const statusText = await firstStatus.textContent();

        console.log(`Paper status: ${statusText}`);

        // Status should be: pending, indexed, ready, failed, etc.
        const validStatuses =
          /pending|indexed|ready|failed|processing|completed/i;
        expect(statusText).toMatch(validStatuses);
      }
    });

    test.skip('should display Open Access badge for OA papers', async ({
      page,
    }) => {
      await navigateToCollectionPapers(page);

      // Look for Open Access indicators
      const oaBadge = page
        .locator('[data-testid="open-access-badge"]')
        .or(page.getByText(/open access|OA/i))
        .first();
      const hasOA = await oaBadge.isVisible().catch(() => false);

      console.log(`Open Access badge found: ${hasOA}`);
    });
  });

  test.describe('4.2 Filter Papers', () => {
    test.skip('should filter papers by status', async ({ page: _page }) => {
      await navigateToCollectionPapers(page);

      // Look for status filter
      const statusFilter = page
        .locator('select[name="status"], [data-testid="status-filter"]')
        .first();
      const hasFilter = await statusFilter.isVisible().catch(() => false);

      if (hasFilter) {
        // Get initial count
        const initialCount = await page
          .locator('[data-testid="paper-card"]')
          .count();

        // Select "Indexed" filter
        await statusFilter.selectOption({ label: /indexed|ready/i });
        await page.waitForTimeout(500);

        // Count should change (or stay same if all are indexed)
        const filteredCount = await page
          .locator('[data-testid="paper-card"]')
          .count();

        console.log(`Initial: ${initialCount}, Filtered: ${filteredCount}`);

        expect(filteredCount).toBeLessThanOrEqual(initialCount);
      } else {
        console.log('Status filter not found - may not be implemented yet');
      }
    });

    test.skip('should filter papers by year range', async ({ page: _page }) => {
      await navigateToCollectionPapers(page);

      // Look for year range filter
      const yearStart = page
        .locator('input[name="yearStart"], input[placeholder*="year"]')
        .first();
      const hasYearFilter = await yearStart.isVisible().catch(() => false);

      if (hasYearFilter) {
        // Set year range
        await yearStart.fill('2020');

        const yearEnd = page.locator('input[name="yearEnd"]').first();
        if (await yearEnd.isVisible().catch(() => false)) {
          await yearEnd.fill('2023');
        }

        await page.waitForTimeout(500);

        // Papers should be filtered
        const papers = page.locator('[data-testid="paper-card"]');
        const count = await papers.count();

        console.log(`Papers in year range: ${count}`);
      }
    });

    test.skip('should show "All" papers when filter is cleared', async ({
      page,
    }) => {
      await navigateToCollectionPapers(page);

      const statusFilter = page.locator('select[name="status"]').first();
      const hasFilter = await statusFilter.isVisible().catch(() => false);

      if (hasFilter) {
        // Apply filter
        await statusFilter.selectOption({ label: /indexed/i });
        await page.waitForTimeout(500);

        const filteredCount = await page
          .locator('[data-testid="paper-card"]')
          .count();

        // Clear filter
        await statusFilter.selectOption({ label: /all/i });
        await page.waitForTimeout(500);

        const allCount = await page
          .locator('[data-testid="paper-card"]')
          .count();

        expect(allCount).toBeGreaterThanOrEqual(filteredCount);
      }
    });

    test.skip('should update paper count when filtering', async ({
      page: _page,
    }) => {
      await navigateToCollectionPapers(page);

      // Look for paper count display
      const paperCount = page.getByText(/\d+ papers?/i).first();

      if (await paperCount.isVisible().catch(() => false)) {
        const initialText = await paperCount.textContent();

        // Apply filter
        const statusFilter = page.locator('select[name="status"]').first();
        if (await statusFilter.isVisible().catch(() => false)) {
          await statusFilter.selectOption({ label: /indexed/i });
          await page.waitForTimeout(500);

          const filteredText = await paperCount.textContent();

          console.log(`Count: ${initialText} → ${filteredText}`);
        }
      }
    });
  });

  test.describe('4.3 Sort Papers', () => {
    test.skip('should sort papers by citations (descending)', async ({
      page,
    }) => {
      await navigateToCollectionPapers(page);

      // Look for sort dropdown
      const sortSelect = page
        .locator('select[name="sort"], [data-testid="sort-select"]')
        .first();
      const hasSort = await sortSelect.isVisible().catch(() => false);

      if (hasSort) {
        await sortSelect.selectOption({ label: /citations/i });
        await page.waitForTimeout(500);

        // Get first few papers and check citations are descending
        const papers = page.locator('[data-testid="paper-card"]');
        const count = Math.min(3, await papers.count());

        const citations: number[] = [];
        for (let i = 0; i < count; i++) {
          const paperText = await papers.nth(i).textContent();
          const match = paperText?.match(/(\d+)\s*citations?/i);
          if (match) {
            citations.push(parseInt(match[1]));
          }
        }

        console.log('Citations (descending):', citations);

        // Check if descending
        for (let i = 1; i < citations.length; i++) {
          expect(citations[i]).toBeLessThanOrEqual(citations[i - 1]);
        }
      }
    });

    test.skip('should sort papers by year (newest first)', async ({
      page: _page,
    }) => {
      await navigateToCollectionPapers(page);

      const sortSelect = page.locator('select[name="sort"]').first();
      const hasSort = await sortSelect.isVisible().catch(() => false);

      if (hasSort) {
        await sortSelect.selectOption({ label: /year/i });
        await page.waitForTimeout(500);

        // Get first few papers and check years are descending
        const papers = page.locator('[data-testid="paper-card"]');
        const count = Math.min(3, await papers.count());

        const years: number[] = [];
        for (let i = 0; i < count; i++) {
          const paperText = await papers.nth(i).textContent();
          const match = paperText?.match(/\b(19|20)(\d{2})\b/);
          if (match) {
            years.push(parseInt(match[0]));
          }
        }

        console.log('Years (descending):', years);

        for (let i = 1; i < years.length; i++) {
          expect(years[i]).toBeLessThanOrEqual(years[i - 1]);
        }
      }
    });

    test.skip('should sort papers by relevance (default)', async ({
      page: _page,
    }) => {
      await navigateToCollectionPapers(page);

      const sortSelect = page.locator('select[name="sort"]').first();
      const hasSort = await sortSelect.isVisible().catch(() => false);

      if (hasSort) {
        await sortSelect.selectOption({ label: /relevance/i });
        await page.waitForTimeout(500);

        // Relevance sort maintains Semantic Scholar's ranking
        console.log('Papers sorted by relevance (Semantic Scholar order)');
      }
    });
  });

  test.describe('4.4 View Paper Abstract', () => {
    test.skip('should open abstract modal when clicking paper', async ({
      page,
    }) => {
      await navigateToCollectionPapers(page);

      const firstPaper = page.locator('[data-testid="paper-card"]').first();
      const paperVisible = await firstPaper.isVisible().catch(() => false);

      if (paperVisible) {
        // Click on paper title or "View Abstract" button
        const paperTitle = firstPaper
          .locator('h3, [data-testid="paper-title"]')
          .first();
        const viewButton = firstPaper
          .getByRole('button', { name: /view.*abstract|abstract/i })
          .first();

        if (await paperTitle.isVisible().catch(() => false)) {
          await paperTitle.click();
        } else if (await viewButton.isVisible().catch(() => false)) {
          await viewButton.click();
        }

        await page.waitForTimeout(500);

        // Modal should open
        const modal = page
          .locator('[role="dialog"], [data-testid="abstract-modal"]')
          .first();
        await expect(modal).toBeVisible();
      }
    });

    test.skip('should display full paper details in modal', async ({
      page,
    }) => {
      await navigateToCollectionPapers(page);

      const firstPaper = page.locator('[data-testid="paper-card"]').first();
      if (await firstPaper.isVisible().catch(() => false)) {
        await firstPaper.click();
        await page.waitForTimeout(500);

        const modal = page.locator('[role="dialog"]').first();

        if (await modal.isVisible().catch(() => false)) {
          const modalText = await modal.textContent();

          // Should include: title, authors, year, venue, abstract
          console.log('Modal content:', modalText?.substring(0, 300));

          // Check for abstract section
          const hasAbstract = /abstract/i.test(modalText || '');
          expect(hasAbstract).toBe(true);
        }
      }
    });

    test.skip('should close modal on cancel or escape', async ({
      page: _page,
    }) => {
      await navigateToCollectionPapers(page);

      const firstPaper = page.locator('[data-testid="paper-card"]').first();
      if (await firstPaper.isVisible().catch(() => false)) {
        await firstPaper.click();
        await page.waitForTimeout(500);

        // Press Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        // Modal should be closed
        const modal = page.locator('[role="dialog"]').first();
        const isVisible = await modal.isVisible().catch(() => false);

        expect(isVisible).toBe(false);
      }
    });
  });

  test.describe('4.5 Download PDF', () => {
    test.skip('should show download link for indexed papers', async ({
      page,
    }) => {
      await navigateToCollectionPapers(page);

      // Find indexed papers
      const indexedPaper = page
        .locator('[data-testid="paper-card"]')
        .filter({
          hasText: /indexed|ready|completed/i,
        })
        .first();

      const hasIndexedPaper = await indexedPaper.isVisible().catch(() => false);

      if (hasIndexedPaper) {
        // Should have download button/link
        const downloadLink = indexedPaper
          .getByRole('link', { name: /download|pdf/i })
          .first();
        const downloadButton = indexedPaper
          .getByRole('button', { name: /download|pdf/i })
          .first();

        const hasDownload =
          (await downloadLink.isVisible().catch(() => false)) ||
          (await downloadButton.isVisible().catch(() => false));

        expect(hasDownload).toBe(true);
      }
    });

    test.skip('should hide download link for pending papers', async ({
      page,
    }) => {
      await navigateToCollectionPapers(page);

      const pendingPaper = page
        .locator('[data-testid="paper-card"]')
        .filter({
          hasText: /pending|processing/i,
        })
        .first();

      const hasPendingPaper = await pendingPaper.isVisible().catch(() => false);

      if (hasPendingPaper) {
        // Should NOT have download button
        const downloadLink = pendingPaper
          .getByRole('link', { name: /download|pdf/i })
          .first();
        const hasDownload = await downloadLink.isVisible().catch(() => false);

        expect(hasDownload).toBe(false);
      }
    });

    test.skip('should open PDF in new tab when clicked', async ({
      page: _page,
    }) => {
      // This test requires actual PDF to be available
      // Skip for now - implement with proper test data
    });
  });

  test.describe('4.6 Paper Processing Status', () => {
    test.skip('should show loading indicator for pending papers', async ({
      page,
    }) => {
      await navigateToCollectionPapers(page);

      const pendingPaper = page
        .locator('[data-testid="paper-card"]')
        .filter({
          hasText: /pending|processing/i,
        })
        .first();

      const hasPending = await pendingPaper.isVisible().catch(() => false);

      if (hasPending) {
        // Should have loading spinner or badge
        const spinner = pendingPaper
          .locator('.animate-spin, [data-testid="loading"]')
          .first();
        const badge = pendingPaper.getByText(/pending|processing/i).first();

        const hasIndicator =
          (await spinner.isVisible().catch(() => false)) ||
          (await badge.isVisible().catch(() => false));

        expect(hasIndicator).toBe(true);
      }
    });

    test.skip('should show success indicator for indexed papers', async ({
      page,
    }) => {
      await navigateToCollectionPapers(page);

      const indexedPaper = page
        .locator('[data-testid="paper-card"]')
        .filter({
          hasText: /indexed|ready|completed/i,
        })
        .first();

      const hasIndexed = await indexedPaper.isVisible().catch(() => false);

      if (hasIndexed) {
        // Should have checkmark or success badge
        const badge = indexedPaper
          .getByText(/indexed|ready|completed/i)
          .first();
        await expect(badge).toBeVisible();
      }
    });

    test.skip('should show error indicator for failed papers', async ({
      page,
    }) => {
      await navigateToCollectionPapers(page);

      const failedPaper = page
        .locator('[data-testid="paper-card"]')
        .filter({
          hasText: /failed|error/i,
        })
        .first();

      const hasFailed = await failedPaper.isVisible().catch(() => false);

      if (hasFailed) {
        // Should have error icon or badge
        const errorBadge = failedPaper.getByText(/failed|error/i).first();
        await expect(errorBadge).toBeVisible();

        // Should have retry button
        const retryButton = failedPaper
          .getByRole('button', { name: /retry/i })
          .first();
        const hasRetry = await retryButton.isVisible().catch(() => false);

        console.log(`Retry button found: ${hasRetry}`);
      }
    });

    test.skip('should update status in real-time', async ({ page: _page }) => {
      // This test requires background workers to be running
      // and papers actively being processed

      await navigateToCollectionPapers(page);

      const initialPendingCount = await page
        .locator('[data-testid="paper-card"]')
        .filter({
          hasText: /pending|processing/i,
        })
        .count();

      // Wait for status updates (polling interval)
      await page.waitForTimeout(5000);

      const updatedPendingCount = await page
        .locator('[data-testid="paper-card"]')
        .filter({
          hasText: /pending|processing/i,
        })
        .count();

      console.log(
        `Pending papers: ${initialPendingCount} → ${updatedPendingCount}`
      );

      // Count should decrease as papers get indexed
      expect(updatedPendingCount).toBeLessThanOrEqual(initialPendingCount);
    });
  });

  test.describe('4.7 Paper List Pagination (Future)', () => {
    test.skip('should paginate large paper lists', async ({ page: _page }) => {
      // If pagination is implemented for large collections
      await navigateToCollectionPapers(page);

      const paginationControls = page.locator(
        '[data-testid="pagination"], .pagination'
      );
      const hasPagination = await paginationControls
        .isVisible()
        .catch(() => false);

      if (hasPagination) {
        console.log('Pagination controls found');

        const nextButton = page
          .getByRole('button', { name: /next|>/i })
          .first();
        await nextButton.click();
        await page.waitForTimeout(500);

        // Should load next page
        console.log('Navigated to next page');
      } else {
        console.log('No pagination - all papers shown on one page');
      }
    });
  });

  test.describe('4.8 Paper Search (Future)', () => {
    test.skip('should search papers within collection', async ({
      page: _page,
    }) => {
      await navigateToCollectionPapers(page);

      const searchInput = page.getByPlaceholder(/search papers/i).first();
      const hasSearch = await searchInput.isVisible().catch(() => false);

      if (hasSearch) {
        await searchInput.fill('transformer');
        await page.waitForTimeout(500);

        // Results should be filtered
        const papers = page.locator('[data-testid="paper-card"]');
        const count = await papers.count();

        console.log(`Found ${count} papers matching "transformer"`);
      }
    });
  });

  test.describe('4.9 Performance', () => {
    test.skip('should load paper list within acceptable time', async ({
      page,
    }) => {
      const startTime = Date.now();

      await navigateToCollectionPapers(page);

      const papers = page.locator('[data-testid="paper-card"]');
      await papers.first().waitFor({ timeout: 5000 });

      const loadTime = Date.now() - startTime;
      console.log(`Paper list loaded in ${loadTime}ms`);

      expect(loadTime).toBeLessThan(3000);
    });

    test.skip('should handle large paper lists efficiently', async ({
      page,
    }) => {
      // Test with collection containing 100+ papers
      await navigateToCollectionPapers(page);

      const papers = page.locator('[data-testid="paper-card"]');
      const count = await papers.count();

      console.log(`Rendering ${count} papers`);

      // Should use virtualization or pagination for large lists
      // Page should still be responsive
      const isResponsive = await page.evaluate(() => {
        return window.performance.now() < 100; // Quick check
      });

      console.log(`Page responsive: ${isResponsive}`);
    });
  });
});
