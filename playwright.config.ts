import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E testing
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',

  fullyParallel: false,
  workers: 1,
  
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Reporter to use */
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  
  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: 'http://127.0.0.1:3100',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Video on failure */
    video: 'on-first-retry',
  },

  /* Configure projects for different browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Uncomment for more browser coverage
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'node scripts/start-playwright-server.js',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: process.env.PW_REUSE_SERVER === '1',
    timeout: 120 * 1000,
    env: {
      JWT_SECRET: 'e2e-test-secret-key',
      NODE_ENV: 'test',
      PORT: '3100',
      DISABLE_HTTPS: 'true',
    },
  },
  
  /* Timeout for each test */
  timeout: 30 * 1000,
  
  /* Expect timeout */
  expect: {
    timeout: 5000,
  },
});
