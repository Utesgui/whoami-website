import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/pages',
  use: { baseURL: 'http://127.0.0.1:4180/whoami-website/', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run preview:pages',
    url: 'http://127.0.0.1:4180/whoami-website/',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
})
