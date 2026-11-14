import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './tests', testMatch: 'browser.spec.mjs', workers: 1, timeout: 45000,
  use: {baseURL: 'http://127.0.0.1:8771', channel: process.env.PLAYWRIGHT_CHANNEL || 'chromium', viewport: {width: 1440, height: 1000},
    launchOptions: {args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']},
    screenshot: 'only-on-failure', trace: 'retain-on-failure'},
  webServer: {command: 'npm run dev -- --port 8771 --strictPort', url: 'http://127.0.0.1:8771',
    reuseExistingServer: !process.env.CI, timeout: 30000},
});
