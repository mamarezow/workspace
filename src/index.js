// The workspace server. Pages are built into dist/ and served by Cloudflare; this code answers /api/*.
import { HttpError, json } from "./lib/http.js";
import { accountRoutes } from "./accounts/routes.js";
import { notificationRoutes } from "./notifications/routes.js";
import { workspaceRoutes } from "./workspaces/routes.js";

const routers = [accountRoutes, workspaceRoutes, notificationRoutes];

// Every change must come from our own pages: a form on another site cannot add this header.
const OWN_PAGE_HEADER = "x-ws";

export default {
  /** @param {Request} req @param {Env} env */
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    // Telegram's webhook proves itself with its own secret header instead (see accounts/telegram-bot.js).
    const fromTelegram = url.pathname === "/api/telegram/webhook";
    if (req.method !== "GET" && !fromTelegram && req.headers.get(OWN_PAGE_HEADER) !== "1") return json({ error: "forbidden" }, 403);
    const ctx = { req, env, url, secure: url.protocol === "https:" };
    try {
      for (const r of routers) {
        const res = await r.handle(ctx);
        if (res) return res;
      }
      return json({ error: "not_found" }, 404);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(req.method, url.pathname, e);
      return json({ error: "server_error" }, 500);
    }
  },
};
