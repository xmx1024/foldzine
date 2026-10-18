const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: 'tests',
  timeout: 60000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:8087', channel: process.env.PW_CHANNEL || undefined, acceptDownloads: true },
  webServer: { command: 'node tests/serve.js', url: 'http://127.0.0.1:8087/index.html', reuseExistingServer: !process.env.CI },
});
