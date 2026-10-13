import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './e2e', timeout: 30000, use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 1366, height: 900 }, headless: true, launchOptions: { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } }, webServer: { command: 'npm run dev -- --port 5173', url: 'http://127.0.0.1:5173', reuseExistingServer: true } });
