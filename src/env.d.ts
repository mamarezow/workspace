// What Cloudflare hands the worker (see wrangler.jsonc).
interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  BOT_USERNAME?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_API?: string;          // only for tests: a stand-in for api.telegram.org
  OPEN_SIGNUP?: string;           // "1" = anyone may make an account; otherwise only the accounts already there
}
