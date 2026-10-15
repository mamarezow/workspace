import { json } from "../lib/http.js";
import { Router } from "../lib/router.js";
import { requireUser } from "../accounts/routes.js";
import { listNotifications, markAllRead } from "./store.js";

export const notificationRoutes = new Router()
  .on("GET /api/notifications", async (ctx) => json({ notifications: await listNotifications(ctx.env, (await requireUser(ctx)).id) }))
  .on("POST /api/notifications/read", async (ctx) => {
    await markAllRead(ctx.env, (await requireUser(ctx)).id);
    return json({ ok: true });
  });
