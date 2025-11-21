/**
 * Authentication Helper for E2E Tests
 *
 * Provides functions to log in test users for authenticated test scenarios
 */
import { Page } from '@playwright/test';
import { TEST_USER, ROUTES } from './test-utils';

/**
 * Log in the test user using Supabase Auth
 * This uses the test account created in supabase/seeds/test-user.sql
 */
export async function loginTestUser(page: Page): Promise<void> {
  // First try session injection which is more reliable for tests
  try {
    await injectAuthSession(page);
    console.log('  ✅ Logged in via session injection');
    return;
  } catch (error) {
    console.log('  ⚠️  Session injection failed, trying UI login:', error);
  }

  // Fallback to UI login
  await page.goto(ROUTES.LOGIN);
  await page.waitForLoadState('load');

  // Check if already logged in
  const isAlreadyLoggedIn =
    (await page.getByText(/sign out|logout/i).count()) > 0;
  if (isAlreadyLoggedIn) {
    console.log('  ✅ Already logged in');
    return;
  }

  // Look for email/password login form
  const emailInput = page
    .locator('input[type="email"], input[name="email"]')
    .first();
  const passwordInput = page
    .locator('input[type="password"], input[name="password"]')
    .first();

  const hasEmailPasswordForm =
    (await emailInput.count()) > 0 && (await passwordInput.count()) > 0;

  if (hasEmailPasswordForm) {
    // Fill in credentials
    await emailInput.fill(TEST_USER.EMAIL);
    await passwordInput.fill(TEST_USER.PASSWORD);

    // Click sign in button
    const signInButton = page
      .getByRole('button', { name: /sign in|login/i })
      .first();
    await signInButton.click();

    // Wait for redirect after login
    await page.waitForURL(/\/collections|\//, { timeout: 10000 });

    // Wait a bit more for session to be fully stored
    await page.waitForTimeout(1000);

    console.log('  ✅ Logged in with email/password');
  } else {
    throw new Error('No login form found and session injection failed');
  }
}

/**
 * Inject authentication session directly via Supabase client
 * This is a more reliable method for E2E tests as it bypasses UI
 */
async function injectAuthSession(page: Page): Promise<void> {
  // Navigate to home page first to set domain for localStorage
  await page.goto(ROUTES.HOME);
  await page.waitForLoadState('load');

  // Inject session via Supabase client in browser context
  await page.evaluate(
    async ({ email, password, supabaseUrl, supabaseKey }) => {
      // Import Supabase client
      const { createClient } = await import('@supabase/supabase-js');

      const supabase = createClient(supabaseUrl, supabaseKey);

      // Sign in
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw new Error(`Failed to sign in: ${error.message}`);
      }

      if (!data.session) {
        throw new Error('No session returned from sign in');
      }

      // Session is automatically stored in localStorage by Supabase client
      console.log('Session injected successfully');
    },
    {
      email: TEST_USER.EMAIL,
      password: TEST_USER.PASSWORD,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    }
  );

  // Wait a bit for session to be fully stored
  await page.waitForTimeout(500);
}

/**
 * Log out the current user
 */
export async function logoutTestUser(page: Page): Promise<void> {
  // Look for sign out button
  const signOutButton = page
    .getByRole('button', { name: /sign out|logout/i })
    .first();

  const hasSignOutButton = (await signOutButton.count()) > 0;

  if (hasSignOutButton) {
    await signOutButton.click();
    await page.waitForTimeout(1000);
  }

  // Clear all cookies and storage
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  console.log('  ✅ Logged out');
}

/**
 * Check if user is currently logged in
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  const hasSignOutButton =
    (await page.getByText(/sign out|logout/i).count()) > 0;
  const hasLoginButton = (await page.getByText(/sign in|login/i).count()) > 0;

  return hasSignOutButton && !hasLoginButton;
}

/**
 * Ensure user is logged in before running test
 * Use this at the beginning of tests that require authentication
 */
export async function ensureLoggedIn(page: Page): Promise<void> {
  const loggedIn = await isLoggedIn(page);

  if (!loggedIn) {
    await loginTestUser(page);
  }
}
