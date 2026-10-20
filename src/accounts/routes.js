// The account pages' API: sign up, sign in (password or Telegram), sign out, profile and settings.
import { HttpError, json, readBody } from "../lib/http.js";
import { Router } from "../lib/router.js";
import * as store from "./store.js";
import { signupOpen, telegramSignIn, verifyInitData } from "./telegram.js";

const COOKIE = "sid";

/** @param {Request} req */
export function sessionToken(req) {
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}
const cookie = (value, maxAge, secure) => `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;

/** Signs userId in: a new session and its cookie. */
async function signedIn(ctx, userId, body = { ok: true }) {
  const token = await store.startSession(ctx.env, userId);
  return json(body, 200, { "set-cookie": cookie(token, store.SESSION_DAYS * 86400, ctx.secure) });
}

/** The signed-in person, or a 401. @param {import("../lib/router.js").Ctx} ctx */
export async function requireUser(ctx) {
  const u = await store.sessionUser(ctx.env, sessionToken(ctx.req));
  if (!u) throw new HttpError("signed_out", 401);
  return u;
}

/** What the page gets about the person signed in. */
async function me(env, u) {
  const tg = await store.telegramOfUser(env, u.id);
  return { ...u, telegram: tg ? { username: tg.tgUsername, messages: tg.writeOk } : null, bot: env.BOT_USERNAME || null };
}

export const accountRoutes = new Router()
  .on("GET /api/auth/options", async (ctx) => json({ signup: signupOpen(ctx.env) }))
  .on("POST /api/auth/signup", async (ctx) => {
    if (!signupOpen(ctx.env)) throw new HttpError("signup_closed", 403);
    const b = await readBody(ctx.req);
    const u = await store.createUser(ctx.env, { username: b.username, password: String(b.password ?? ""), email: b.email, lang: b.lang, display: b.display });
    return signedIn(ctx, u.id);
  })
  .on("POST /api/auth/login", async (ctx) => {
    const b = await readBody(ctx.req);
    const u = await store.checkLogin(ctx.env, b.username, b.password);
    return signedIn(ctx, u.id);
  })
  .on("POST /api/auth/telegram", async (ctx) => {
    const b = await readBody(ctx.req);
    const { user: tg, startParam } = await verifyInitData(b.initData, ctx.env.TELEGRAM_BOT_TOKEN);
    const { userId, fresh } = await telegramSignIn(ctx.env, tg);
    return signedIn(ctx, userId, { ok: true, fresh, startParam });
  })
  .on("POST /api/auth/logout", async (ctx) => {
    await store.endSession(ctx.env, sessionToken(ctx.req));
    return json({ ok: true }, 200, { "set-cookie": cookie("", 0, ctx.secure) });
  })
  .on("GET /api/me", async (ctx) => json({ user: await me(ctx.env, await requireUser(ctx)) }))
  .on("PATCH /api/me", async (ctx) => {
    const u = await requireUser(ctx), b = await readBody(ctx.req);
    const next = await store.updateProfile(ctx.env, u.id, { display: b.display, about: b.about, email: b.email, lang: b.lang, cal: b.cal, weekStart: b.weekStart });
    return json({ user: await me(ctx.env, next) });
  })
  .on("POST /api/me/username", async (ctx) => {
    const u = await requireUser(ctx), b = await readBody(ctx.req);
    return json({ username: await store.changeUsername(ctx.env, u.id, b.username, b.password) });
  })
  .on("POST /api/me/password", async (ctx) => {
    const u = await requireUser(ctx), b = await readBody(ctx.req);
    await store.changePassword(ctx.env, u.id, b.current, b.next);
    return signedIn(ctx, u.id);   // every other device is signed out; this one stays in
  })
  // "I already have an account": move this Telegram over to it, dropping the account made automatically
  .on("POST /api/me/telegram/switch", async (ctx) => {
    const u = await requireUser(ctx), b = await readBody(ctx.req);
    const { user: tg } = await verifyInitData(b.initData, ctx.env.TELEGRAM_BOT_TOKEN);
    const link = await store.telegramLink(ctx.env, tg.id);
    if (!link || link.userId !== u.id || !u.autoMade) throw new HttpError("not_allowed", 403);
    const target = await store.checkLogin(ctx.env, b.username, b.password);
    if (target.id === u.id) return json({ ok: true });
    await store.attachTelegram(ctx.env, { telegramId: tg.id, userId: target.id, tgUsername: tg.username || null, writeOk: link.writeOk });
    return signedIn(ctx, target.id);
  })
  .on("DELETE /api/me/telegram", async (ctx) => {
    const u = await requireUser(ctx);
    if (!u.hasPassword) throw new HttpError("set_password_first");
    await store.unlinkTelegram(ctx.env, u.id);
    return json({ ok: true });
  });
