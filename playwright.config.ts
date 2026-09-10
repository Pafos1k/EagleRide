import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'ui.spec.ts',
  use: { baseURL: 'http://127.0.0.1:3100', browserName: 'chromium' },
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:3100/api/health',
    env: { PORT: '3100', GEMINI_API_KEY: '', API_KEY: '', DOTENV_CONFIG_PATH: 'tests/.env.disabled' },
    reuseExistingServer: false,
  },
});
