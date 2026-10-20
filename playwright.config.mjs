// End-to-end tests: `npm run test:e2e` builds the pages, starts the worker on this computer with an
// empty local database (migrations applied), and checks the API and pages against it.
import { defineConfig } from "@playwright/test";

const STATE = ".wrangler/test-state";
export const BOT_TOKEN = "123:test-token";

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:8787",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: [
      `rm -rf ${STATE}`,
      `npx wrangler d1 migrations apply DB --local --persist-to ${STATE}`,
      `npx wrangler dev --ip 127.0.0.1 --port 8787 --persist-to ${STATE} --var TELEGRAM_BOT_TOKEN:${BOT_TOKEN} --var OPEN_SIGNUP:1`,
    ].join(" && "),
    url: "http://127.0.0.1:8787/",
    timeout: 120_000,
    reuseExistingServer: false,
    env: { CI: "1", NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost" },
  },
});
