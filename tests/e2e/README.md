# CiteBite E2E Tests

This directory contains comprehensive end-to-end tests for all CiteBite features using Playwright.

## Overview

The E2E tests validate the entire user experience from the browser's perspective, including:

- UI/UX validation
- Authentication flows
- Collection management
- Paper management
- Chat functionality
- Error handling and edge cases
- Complete user journeys

## Test Structure

```
tests/e2e/
├── 01-ui-ux-validation.spec.ts          # Basic UI/UX testing
├── 02-authentication.spec.ts             # Login, logout, protected routes
├── 03-collection-management.spec.ts      # CRUD operations for collections
├── 04-paper-management.spec.ts           # Paper viewing, filtering, sorting
├── 05-chat-functionality.spec.ts         # AI chat with citations
├── 06-error-handling-integration.spec.ts # Error scenarios and complete flows
└── helpers/
    └── test-utils.ts                     # Shared utilities and constants
```

## Prerequisites

1. **Install dependencies:**

   ```bash
   npm install
   # or
   pnpm install
   ```

2. **Install Playwright browsers:**

   ```bash
   npx playwright install
   ```

3. **Start the development server:**

   ```bash
   npm run dev
   # Server should be running on http://localhost:3000
   ```

4. **Set up test environment:**
   - Ensure local Supabase is running: `npx supabase start`
   - Ensure Redis is running (for background jobs)
   - Configure test environment variables in `.env.local`

## Running Tests

### Run all tests

```bash
npx playwright test
```

### Run specific test file

```bash
npx playwright test tests/e2e/01-ui-ux-validation.spec.ts
```

### Run tests in headed mode (see browser)

```bash
npx playwright test --headed
```

### Run tests in UI mode (interactive)

```bash
npx playwright test --ui
```

### Run tests in specific browser

```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

### Run tests with debug mode

```bash
npx playwright test --debug
```

### Generate test report

```bash
npx playwright show-report
```

## Test Categories

### 1. UI/UX Validation (`01-ui-ux-validation.spec.ts`)

- Homepage layout for authenticated and unauthenticated users
- Navigation functionality
- Responsive design (1920x1080, 1440x900, 1024px minimum)
- Loading states and empty states
- Visual consistency and typography
- Interactive elements (buttons, links)
- Accessibility basics
- Performance benchmarks

**Status:** Most tests are functional, some require authentication setup

### 2. Authentication (`02-authentication.spec.ts`)

- Login page display
- Google OAuth button
- Protected route redirects
- Session persistence
- Logout functionality
- Security checks (no exposed secrets, secure headers)

**Status:** Most tests are skipped until auth is fully configured

### 3. Collection Management (`03-collection-management.spec.ts`)

- View collections list
- Create collection dialog
- Form validation (keywords, filters)
- Collection detail view
- Delete collection
- Collection actions
- Error handling for non-existent collections

**Status:** Many tests are skipped until auth and test data are set up

### 4. Paper Management (`04-paper-management.spec.ts`)

- View paper list with metadata
- Filter papers by status and year
- Sort papers by citations, year, relevance
- View paper abstract modal
- Download PDF for indexed papers
- Paper processing status indicators
- Performance with large datasets

**Status:** Most tests are skipped pending test collections with papers

### 5. Chat Functionality (`05-chat-functionality.spec.ts`)

- Chat interface layout
- Send messages and receive AI responses
- Message input validation (empty, whitespace, Cmd+Enter)
- View conversation history
- Citation display and navigation
- Markdown rendering (bold, lists, code blocks, links)
- Conversation context maintenance
- Error handling (network, timeout)
- Performance benchmarks

**Status:** Most tests are skipped pending auth and indexed papers

### 6. Error Handling & Integration (`06-error-handling-integration.spec.ts`)

- Network errors (offline, slow connection)
- Invalid data handling (404, invalid IDs)
- Form validation
- Authorization checks
- Empty states
- Complete user journeys (new user, returning user)
- Security tests (XSS, CSRF, exposed secrets)
- Performance under load
- Multi-tab behavior
- Browser compatibility
- Console error detection
- Data persistence

**Status:** Basic tests work, integration tests require full setup

## Test Status Legend

- ✅ **Active:** Test runs and validates functionality
- ⏭️ **Skipped:** Test is written but skipped (marked with `test.skip()`)
- 📝 **Future:** Test placeholder for upcoming features

## Skipped Tests

Many tests are currently skipped because they require:

1. **Authentication setup:** OAuth test mode or mock authentication
2. **Test data:** Collections with papers and indexed PDFs
3. **API integrations:** Working Semantic Scholar, Gemini, Supabase connections
4. **Background workers:** PDF download and indexing jobs running

To enable skipped tests:

1. Set up test authentication (see Supabase docs for test mode)
2. Create seed data or use test database
3. Configure all API keys in `.env.test`
4. Start background workers

## Writing New Tests

### Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.describe('Subfeature', () => {
    test('should do something specific', async ({ page }) => {
      // Navigate
      await page.goto('http://localhost:3000/some-page');

      // Interact
      const button = page.getByRole('button', { name: /click me/i });
      await button.click();

      // Assert
      await expect(page.getByText('Success')).toBeVisible();
    });

    // Skip tests that require setup
    test.skip('should do something requiring auth', async ({ page }) => {
      // Test implementation
    });
  });
});
```

### Best Practices

1. Use semantic locators (`getByRole`, `getByText`, `getByLabel`)
2. Wait for network to be idle before assertions
3. Use `test.skip()` for tests requiring special setup
4. Add descriptive test names
5. Log informational messages for debugging
6. Check for both positive and negative cases
7. Clean up test data after tests

### Useful Locators

```typescript
// By role (preferred)
page.getByRole('button', { name: /submit/i });
page.getByRole('link', { name: /home/i });

// By text content
page.getByText(/welcome/i);

// By test ID
page.locator('[data-testid="my-element"]');

// By placeholder
page.getByPlaceholder(/search/i);

// By label
page.getByLabel(/email/i);
```

## Debugging Tests

### Visual debugging

```bash
npx playwright test --headed --debug
```

### Screenshots on failure

Screenshots are automatically saved to `test-results/` on failure.

### Video recording

Configure in `playwright.config.ts`:

```typescript
use: {
  video: 'on-first-retry',
}
```

### Trace viewer

```bash
npx playwright test --trace on
npx playwright show-trace trace.zip
```

### Browser Developer Tools

When running in headed mode, you can open DevTools to inspect the page.

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run build
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Performance Benchmarks

Expected performance thresholds:

- Homepage load: < 2 seconds
- Collections page load: < 3 seconds
- Collection detail load: < 3 seconds
- Chat interface load: < 2 seconds
- AI response time: < 30 seconds (excluding API latency)

## Known Issues

1. **OAuth testing:** Requires special setup for Google OAuth in test mode
2. **Background jobs:** Some tests require workers to be running
3. **Rate limiting:** Semantic Scholar API may throttle requests in CI
4. **Flaky tests:** Network-dependent tests may be flaky in CI

## Future Enhancements

- [ ] Add visual regression testing
- [ ] Add accessibility testing (axe-core)
- [ ] Add performance profiling
- [ ] Add API mocking for isolated tests
- [ ] Add test data fixtures
- [ ] Add parallel test execution
- [ ] Add test coverage reporting
- [ ] Add cross-browser testing in CI

## Related Documentation

- [E2E Test Plan](../../docs/planning/E2E_TEST_PLAN.md) - Detailed test scenarios and requirements
- [ROADMAP.md](../../docs/ROADMAP.md) - Implementation checklist
- [Playwright Documentation](https://playwright.dev/)

## Support

For issues or questions about E2E tests:

1. Check test output and screenshots in `test-results/`
2. Review test plan documentation
3. Check Playwright documentation
4. Review console logs in headed mode

---

**Last Updated:** 2025-11-19
**Playwright Version:** Latest
**Node Version:** 18+
