// The bot: Telegram sends it every message people write to it (the webhook), and it sends sign-in codes.
// Someone signs in on the website by typing their Telegram username; the bot messages them a code,
// which they type back. The bot can only message people who have started it, so it remembers them.
import { HttpError, json, readBody } from "../lib/http.js";
import { hex, hmac, sameText, sha256 } from "../lib/crypto.js";
import { telegramLink } from "./store.js";
import { signupOpen } from "./telegram.js";

const CODE_TTL_MS = 5 * 60_000;     // a code works for five minutes
const RESEND_MS = 60_000;           // and a new one can be asked for after a minute
const MAX_TRIES = 5;                // wrong guesses allowed per Telegram account in TRIES_WINDOW_MS,
const TRIES_WINDOW_MS = 60 * 60_000; // however many new codes are asked for in between

const api = (env) => (env.TELEGRAM_API || "https://api.telegram.org") + "/bot" + env.TELEGRAM_BOT_TOKEN;

/** Calls the Bot API; false when Telegram refused (e.g. they blocked the bot). */
async function call(env, method, body) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new HttpError("telegram_not_set_up", 503);
  try {
    const res = await fetch(`${api(env)}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return res.ok;
  } catch {
    return false;
  }
}

/** What Telegram must send in X-Telegram-Bot-Api-Secret-Token, derived from the bot token. */
const webhookSecret = async (env) => hex(await hmac(env.TELEGRAM_BOT_TOKEN, "webhook")).slice(0, 48);

/** "@Name " → "name" */
export const cleanTgUsername = (s) => String(s ?? "").trim().replace(/^@/, "").toLowerCase().slice(0, 64);

/** Points the bot's webhook at this site. Safe to call again: it only ever points it here. */
export async function setUpWebhook(ctx) {
  const url = `${ctx.url.origin}/api/telegram/webhook`;
  const ok = await call(ctx.env, "setWebhook", { url, secret_token: await webhookSecret(ctx.env), allowed_updates: ["message"] });
  return json({ ok, url }, ok ? 200 : 502);
}

/** A message someone sent the bot: remember who they are, and answer /start. */
export async function webhook(ctx) {
  const { env, req } = ctx;
  if (!env.TELEGRAM_BOT_TOKEN || !sameText(req.headers.get("x-telegram-bot-api-secret-token") || "", await webhookSecret(env))) {
    return json({ error: "forbidden" }, 403);
  }
  const msg = (await readBody(req)).message;
  const from = msg?.from;
  if (!from?.id || from.is_bot || msg.chat?.type !== "private") return json({ ok: true });
  await env.DB.prepare(
    `INSERT INTO telegram_chats (telegram_id, tg_username, first_name, last_name, seen_at) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(telegram_id) DO UPDATE SET tg_username = ?2, first_name = ?3, last_name = ?4, seen_at = ?5`,
  ).bind(String(from.id), from.username ? cleanTgUsername(from.username) : null, from.first_name || null, from.last_name || null, Date.now()).run();
  if (String(msg.text || "").startsWith("/start")) {
    await call(env, "sendMessage", { chat_id: from.id, text: "Hi! To log in, type your Telegram username on the site and press “send code”. The code will come here." });
  }
  return json({ ok: true });
}

/** Sends a code to the Telegram account with this username. */
export async function sendCode(env, username) {
  const name = cleanTgUsername(username);
  if (!name) throw new HttpError("telegram_username_empty");
  const chat = await env.DB.prepare("SELECT * FROM telegram_chats WHERE tg_username = ? ORDER BY seen_at DESC").bind(name).first();
  if (!chat) throw new HttpError("telegram_not_started", 404);
  // with sign-up closed, no code goes to a Telegram account that isn't linked to anyone
  if (!signupOpen(env) && !(await telegramLink(env, chat.telegram_id))) throw new HttpError("telegram_not_member", 403);
  const now = Date.now();
  const last = await env.DB.prepare("SELECT sent_at, tries, tries_from FROM login_codes WHERE telegram_id = ?").bind(chat.telegram_id).first();
  if (last && now - Number(last.sent_at) < RESEND_MS) throw new HttpError("code_wait", 429);
  // wrong guesses carry over to the new code until the window is over, so asking again doesn't buy more guesses
  const fresh = !last || now - Number(last.tries_from) >= TRIES_WINDOW_MS;
  if (!fresh && Number(last.tries) >= MAX_TRIES) throw new HttpError("too_many_attempts", 429);
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  await env.DB.prepare(
    `INSERT INTO login_codes (telegram_id, code_hash, tries, tries_from, sent_at, expires_at) VALUES (?1, ?2, 0, ?3, ?3, ?4)
     ON CONFLICT(telegram_id) DO UPDATE SET code_hash = ?2, sent_at = ?3, expires_at = ?4,
       tries = CASE WHEN ?5 THEN 0 ELSE tries END, tries_from = CASE WHEN ?5 THEN ?3 ELSE tries_from END`,
  ).bind(chat.telegram_id, await sha256(chat.telegram_id + ":" + code), now, now + CODE_TTL_MS, fresh ? 1 : 0).run();
  const sent = await call(env, "sendMessage", { chat_id: Number(chat.telegram_id), text: `Your login code: ${code}\nIt works for 5 minutes. If you didn't ask for it, ignore this message.` });
  if (!sent) {
    // the code never arrived: make it unusable, but keep the row so the wrong-guess count stays
    await env.DB.prepare("UPDATE login_codes SET expires_at = 0 WHERE telegram_id = ?").bind(chat.telegram_id).run();
    throw new HttpError("telegram_send_failed", 502);
  }
}

/**
 * Checks a code; on success the code is used up and the Telegram person is returned, in the shape
 * the mini app's sign-in uses, so both make or find the account the same way.
 */
export async function checkCode(env, username, code) {
  const name = cleanTgUsername(username);
  const chat = name && await env.DB.prepare("SELECT * FROM telegram_chats WHERE tg_username = ? ORDER BY seen_at DESC").bind(name).first();
  const row = chat && await env.DB.prepare("SELECT * FROM login_codes WHERE telegram_id = ?").bind(chat.telegram_id).first();
  if (!row || Number(row.expires_at) < Date.now()) throw new HttpError("code_expired", 401);
  if (row.tries >= MAX_TRIES) throw new HttpError("too_many_attempts", 429);
  const given = String(code ?? "").replace(/\D/g, "");
  if (!sameText(await sha256(chat.telegram_id + ":" + given), row.code_hash)) {
    await env.DB.prepare("UPDATE login_codes SET tries = tries + 1 WHERE telegram_id = ?").bind(chat.telegram_id).run();
    throw new HttpError("code_wrong", 401);
  }
  await env.DB.prepare("DELETE FROM login_codes WHERE telegram_id = ?").bind(chat.telegram_id).run();
  return { id: Number(chat.telegram_id), username: chat.tg_username || undefined, first_name: chat.first_name || undefined, last_name: chat.last_name || undefined };
}
