// Signing in from the Telegram mini app. Telegram signs the launch data with the bot token;
// we check that signature, then sign the person in, making an account on their first visit.
import { HttpError } from "../lib/http.js";
import { hex, hmac, randomHex, sameText } from "../lib/crypto.js";
import { attachTelegram, createUser, findByUsername, telegramLink, validUsername } from "./store.js";

const MAX_AGE_S = 24 * 3600;   // launch data older than a day is refused

/** New accounts are made only when OPEN_SIGNUP is "1"; otherwise just the accounts already there sign in. */
export const signupOpen = (env) => env.OPEN_SIGNUP === "1";

/**
 * Telegram's rule: secret = HMAC("WebAppData", bot token); hash = HMAC(secret, the sorted "key=value" lines).
 * @param {string} initData @param {string | undefined} botToken @param {number} [nowS]
 * @returns {Promise<{ user: { id: number, username?: string, first_name?: string, last_name?: string }, startParam: string }>}
 */
export async function verifyInitData(initData, botToken, nowS = Math.floor(Date.now() / 1000)) {
  if (!botToken) throw new HttpError("telegram_not_set_up", 503);
  const p = new URLSearchParams(String(initData ?? ""));
  const hash = p.get("hash");
  if (!hash) throw new HttpError("telegram_bad_data", 401);
  p.delete("hash");
  const check = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const mine = hex(await hmac(await hmac("WebAppData", botToken), check));
  if (!sameText(mine, hash)) throw new HttpError("telegram_bad_data", 401);
  const age = nowS - Number(p.get("auth_date") || 0);
  if (!(age >= -60 && age < MAX_AGE_S)) throw new HttpError("telegram_expired", 401);
  let user = null;
  try { user = JSON.parse(p.get("user") || "null"); } catch {}
  if (!user || !user.id) throw new HttpError("telegram_bad_data", 401);
  return { user, startParam: p.get("start_param") || "" };
}

// a free username for someone arriving from Telegram: their Telegram username if free, otherwise a random one
async function freeUsername(env, tgUsername) {
  const base = String(tgUsername ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
  const tries = validUsername(base) ? [base, base.slice(0, 15) + randomHex(2)] : [];
  for (let i = 0; i < 5; i++) tries.push("user_" + randomHex(4));
  for (const name of tries) if (!(await findByUsername(env, name))) return name;
  throw new HttpError("try_again", 503);
}

/**
 * The account for this Telegram person, made on the spot the first time.
 * @returns {Promise<{ userId: string, fresh: boolean }>}
 */
export async function telegramSignIn(env, tg) {
  const link = await telegramLink(env, tg.id);
  if (link) return { userId: link.userId, fresh: false };
  if (!signupOpen(env)) throw new HttpError("telegram_not_member", 403);   // only Telegram ids already linked to an account
  const display = [tg.first_name, tg.last_name].filter(Boolean).join(" ");
  let user = null;
  for (let i = 0; i < 3 && !user; i++) {
    try {
      user = await createUser(env, { username: await freeUsername(env, tg.username), password: null, display, auto: true });
    } catch (e) {
      if (!(e instanceof HttpError && e.message === "username_taken")) throw e;   // someone took it a moment ago
    }
  }
  if (!user) throw new HttpError("try_again", 503);
  await attachTelegram(env, { telegramId: tg.id, userId: user.id, tgUsername: tg.username || null });
  return { userId: user.id, fresh: true };
}
