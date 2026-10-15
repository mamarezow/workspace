// What Cloudflare hands the worker (see wrangler.jsonc).
interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  BOT_USERNAME?: string;
  TELEGRAM_BOT_TOKEN?: string;
}
