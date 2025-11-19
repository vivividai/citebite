/**
 * E2E Test Helper Utilities
 *
 * Common functions and constants used across E2E tests
 */

export const TEST_CONFIG = {
  BASE_URL: process.env.BASE_URL || 'http://localhost:3000',
  DEFAULT_TIMEOUT: 30000,
  API_TIMEOUT: 10000,
};

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  COLLECTIONS: '/collections',
  COLLECTION_DETAIL: (id: string) => `/collections/${id}`,
};

export const TEST_USER = {
  EMAIL: 'test@citebite.com',
  NAME: 'Test User',
};

export const MOCK_COLLECTION = {
  KEYWORDS: 'machine learning neural networks',
  TITLE: 'Machine Learning Research',
  MIN_CITATIONS: 10,
  YEAR_START: 2020,
  YEAR_END: 2024,
};

export const MOCK_MESSAGE = {
  SIMPLE: 'What are the main research trends?',
  FOLLOW_UP: 'Can you elaborate on the first point?',
  SPECIFIC: 'Which papers discuss transformer architectures?',
};

/**
 * Wait for a specific condition to be true
 */
export async function waitFor(
  conditionFn: () => Promise<boolean>,
  timeout = TEST_CONFIG.DEFAULT_TIMEOUT,
  interval = 500
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await conditionFn()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Wait for navigation to complete
 */
export async function waitForNavigation(
  expectedUrl: string,
  timeout = 5000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (
      window.location.pathname === expectedUrl ||
      window.location.href.includes(expectedUrl)
    ) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  throw new Error(
    `Navigation to ${expectedUrl} did not complete within ${timeout}ms`
  );
}

/**
 * Simulate typing with realistic delay
 * @param text - Text to split into characters
 * @param _delayMs - Delay between characters (currently not implemented)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function typeWithDelay(text: string, _delayMs = 50): string[] {
  return text.split('').map(char => {
    return char;
  });
}

/**
 * Extract text content from element
 */
export function getTextContent(element: Element | null): string {
  if (!element) return '';
  return element.textContent?.trim() || '';
}

/**
 * Check if element is visible in viewport
 */
export function isInViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <=
      (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * Scroll element into view
 */
export function scrollIntoView(element: Element): void {
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Wait for element to be visible
 */
export async function waitForElement(
  selector: string,
  timeout = TEST_CONFIG.DEFAULT_TIMEOUT
): Promise<Element> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const element = document.querySelector(selector);
    if (element && isElementVisible(element)) {
      return element;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  throw new Error(
    `Element ${selector} not found or not visible within ${timeout}ms`
  );
}

/**
 * Check if element is visible (not display:none or visibility:hidden)
 */
export function isElementVisible(element: Element): boolean {
  const style = window.getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
}

/**
 * Get element by text content
 */
export function getElementByText(text: string, tag = '*'): Element | null {
  const elements = document.querySelectorAll(tag);
  for (const element of Array.from(elements)) {
    if (getTextContent(element) === text) {
      return element;
    }
  }
  return null;
}

/**
 * Wait for API request to complete
 * Placeholder implementation - to be replaced with actual Playwright page.waitForResponse
 */
export async function waitForApiResponse(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _urlPattern: string | RegExp,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _timeout = TEST_CONFIG.API_TIMEOUT
): Promise<void> {
  // This would typically be implemented using page.waitForResponse in Playwright
  // Placeholder for now
  await new Promise(resolve => setTimeout(resolve, 1000));
}

/**
 * Format date for display comparison
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/**
 * Generate random test data
 */
export function generateTestId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Clean up test data (placeholder - implement based on your cleanup needs)
 */
export async function cleanupTestData(testId: string): Promise<void> {
  // Implement cleanup logic here
  console.log(`Cleaning up test data for ${testId}`);
}

/**
 * Mock localStorage for testing
 */
export const mockLocalStorage = {
  getItem: (key: string): string | null => {
    return localStorage.getItem(key);
  },
  setItem: (key: string, value: string): void => {
    localStorage.setItem(key, value);
  },
  removeItem: (key: string): void => {
    localStorage.removeItem(key);
  },
  clear: (): void => {
    localStorage.clear();
  },
};

/**
 * Check if running in CI environment
 */
export function isCI(): boolean {
  return process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
}

/**
 * Get viewport size
 */
export function getViewportSize(): { width: number; height: number } {
  return {
    width: window.innerWidth || document.documentElement.clientWidth,
    height: window.innerHeight || document.documentElement.clientHeight,
  };
}

/**
 * Take screenshot helper (placeholder for Playwright)
 */
export async function takeScreenshot(name: string): Promise<void> {
  console.log(`Taking screenshot: ${name}`);
  // Implement with Playwright's screenshot functionality
}

/**
 * Assertions helpers
 */
export const assertions = {
  /**
   * Assert element exists
   */
  elementExists: (selector: string): boolean => {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element ${selector} does not exist`);
    }
    return true;
  },

  /**
   * Assert element is visible
   */
  elementVisible: (selector: string): boolean => {
    const element = document.querySelector(selector);
    if (!element || !isElementVisible(element)) {
      throw new Error(`Element ${selector} is not visible`);
    }
    return true;
  },

  /**
   * Assert text content matches
   */
  textMatches: (selector: string, expectedText: string): boolean => {
    const element = document.querySelector(selector);
    const actualText = getTextContent(element);
    if (actualText !== expectedText) {
      throw new Error(
        `Expected text "${expectedText}" but got "${actualText}"`
      );
    }
    return true;
  },

  /**
   * Assert element has class
   */
  hasClass: (element: Element, className: string): boolean => {
    if (!element.classList.contains(className)) {
      throw new Error(`Element does not have class "${className}"`);
    }
    return true;
  },
};

/**
 * Performance helpers
 */
export const performance = {
  /**
   * Measure page load time
   */
  measurePageLoad: (): number => {
    const navTiming = window.performance.timing;
    return navTiming.loadEventEnd - navTiming.navigationStart;
  },

  /**
   * Measure time to interactive
   */
  measureTimeToInteractive: (): number => {
    const navTiming = window.performance.timing;
    return navTiming.domInteractive - navTiming.navigationStart;
  },

  /**
   * Start performance measurement
   */
  startMeasure: (name: string): void => {
    window.performance.mark(`${name}-start`);
  },

  /**
   * End performance measurement and get duration
   */
  endMeasure: (name: string): number => {
    window.performance.mark(`${name}-end`);
    window.performance.measure(name, `${name}-start`, `${name}-end`);
    const measure = window.performance.getEntriesByName(name)[0];
    return measure.duration;
  },
};
