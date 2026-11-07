import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    // Disposable completed-intro fixture. Not a device/app-data reset. First-launch tests override storageState.
    storageState: {
      cookies: [],
      origins: [
        {origin:'http://127.0.0.1:4173',localStorage:[{name:'acquiring-onboarding',value:'{"hasCompletedIntroduction":true}'}]},
        {origin:'http://127.0.0.1:5173',localStorage:[{name:'acquiring-onboarding',value:'{"hasCompletedIntroduction":true}'}]},
      ],
    },
  },
  projects: [{ name: 'chrome', use: {
    ...devices['Desktop Chrome'],
    channel: process.env.CI ? undefined : 'chrome',
    // Playwright fake device for product getUserMedia. Not the SYNTHETIC oscillator fixture. Not Pixel.
    launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
  } }],
  webServer: [
    { command: 'npm run preview -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 30_000 },
    { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: false, timeout: 30_000 },
  ],
});
