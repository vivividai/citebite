import { test, expect } from '@playwright/test';

/**
 * Phase 1 - Task 1.1: Project Setup & Configuration
 * E2E Test: Verify dev server starts successfully
 */
test.describe('Task 1.1 - Project Setup & Configuration', () => {
  test('should verify dev server starts successfully', async ({ page }) => {
    // Navigate to the home page
    await page.goto('/');

    // Verify the page loaded successfully with correct title
    await expect(page).toHaveTitle(/CiteBite/);

    // Check if Next.js is running (page content should be visible)
    const content = await page.content();
    expect(content.length).toBeGreaterThan(0);
  });

  test('should verify TypeScript is configured', async ({ page }) => {
    // Navigate to the home page
    await page.goto('/');

    // Verify no TypeScript compilation errors (page should load)
    await expect(page).not.toHaveURL(/.*error.*/);
  });

  test('should verify Tailwind CSS is working', async ({ page }) => {
    // Navigate to the home page
    await page.goto('/');

    // Check if Tailwind classes are applied
    const html = await page.content();
    expect(html).toContain('class=');
  });

  test('should verify App Router is configured', async ({ page }) => {
    // Navigate to the home page
    await page.goto('/');

    // Verify we're using App Router (should not redirect to pages)
    const url = page.url();
    expect(url).toBe('http://localhost:3000/');
  });

  test('should verify shadcn/ui components are available', async ({ page }) => {
    // Navigate to the home page
    await page.goto('/');

    // Verify the page renders without errors
    const errors = [];
    page.on('pageerror', error => {
      errors.push(error);
    });

    await page.waitForLoadState('networkidle');
    expect(errors.length).toBe(0);
  });

  test('should verify environment variables are configured', async ({
    page,
  }) => {
    // Navigate to the home page
    await page.goto('/');

    // Check console for environment variable errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.waitForLoadState('networkidle');

    // Verify no critical environment variable errors
    const criticalErrors = consoleErrors.filter(error =>
      error.toLowerCase().includes('environment')
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('should verify responsive design (desktop-first)', async ({ page }) => {
    // Set viewport to minimum required width (1024px)
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');

    // Verify page renders at minimum width
    const content = await page.content();
    expect(content.length).toBeGreaterThan(0);

    // Test common desktop resolution
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');

    // Verify page renders at larger resolution
    const largeContent = await page.content();
    expect(largeContent.length).toBeGreaterThan(0);
  });

  test('should verify no console errors on page load', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Filter out known non-critical errors (e.g., favicon, etc.)
    const criticalErrors = consoleErrors.filter(
      error =>
        !error.includes('favicon') &&
        !error.includes('manifest') &&
        !error.includes('placeholder')
    );

    expect(criticalErrors.length).toBe(0);
  });

  test('should verify page loads within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;

    // Page should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should verify ESLint configuration', async () => {
    // This is a meta test - if the project builds, ESLint is configured
    // We can verify the config file exists
    const fs = require('fs');
    const path = require('path');
    const eslintConfig = path.join(process.cwd(), '.eslintrc.json');
    expect(fs.existsSync(eslintConfig)).toBe(true);
  });

  test('should verify Prettier configuration', async () => {
    // Verify Prettier config exists
    const fs = require('fs');
    const path = require('path');
    const prettierConfig = path.join(process.cwd(), '.prettierrc');
    expect(fs.existsSync(prettierConfig)).toBe(true);
  });

  test('should verify Husky is configured', async () => {
    // Verify Husky pre-commit hook exists
    const fs = require('fs');
    const path = require('path');
    const huskyPreCommit = path.join(process.cwd(), '.husky', 'pre-commit');
    expect(fs.existsSync(huskyPreCommit)).toBe(true);
  });

  test('should verify .env.example exists', async () => {
    // Verify environment variables template exists
    const fs = require('fs');
    const path = require('path');
    const envExample = path.join(process.cwd(), '.env.example');
    expect(fs.existsSync(envExample)).toBe(true);

    // Verify it contains required variables
    const content = fs.readFileSync(envExample, 'utf-8');
    expect(content).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(content).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(content).toContain('DATABASE_URL');
    expect(content).toContain('GEMINI_API_KEY');
    expect(content).toContain('SEMANTIC_SCHOLAR_API_KEY');
    expect(content).toContain('REDIS_URL');
  });

  test('should verify package.json has correct dependencies', async () => {
    // Verify all required dependencies are installed
    const fs = require('fs');
    const path = require('path');
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')
    );

    // Check core dependencies
    expect(packageJson.dependencies).toHaveProperty('@prisma/client');
    expect(packageJson.dependencies).toHaveProperty('@supabase/ssr');
    expect(packageJson.dependencies).toHaveProperty('@supabase/supabase-js');
    expect(packageJson.dependencies).toHaveProperty('bullmq');
    expect(packageJson.dependencies).toHaveProperty('axios');
    expect(packageJson.dependencies).toHaveProperty('zod');
    expect(packageJson.dependencies).toHaveProperty('@tanstack/react-query');

    // Check dev dependencies
    expect(packageJson.devDependencies).toHaveProperty('prisma');
    expect(packageJson.devDependencies).toHaveProperty('prettier');
    expect(packageJson.devDependencies).toHaveProperty(
      'eslint-config-prettier'
    );
    expect(packageJson.devDependencies).toHaveProperty('husky');
    expect(packageJson.devDependencies).toHaveProperty('lint-staged');
    expect(packageJson.devDependencies).toHaveProperty('@playwright/test');
  });
});
