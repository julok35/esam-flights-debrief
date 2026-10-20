// Tests de bout en bout (critères d'acceptation, section 11) : Chromium, format smartphone, serveur local.
import { defineConfig, devices } from '@playwright/test';

var port = 4173;
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Pixel 7'],
    browserName: 'chromium',
    baseURL: 'http://localhost:' + port,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris'
  },
  webServer: {
    command: 'node scripts/serve.js',
    env: { PORT: String(port) },
    port: port,
    reuseExistingServer: !process.env.CI
  }
});
