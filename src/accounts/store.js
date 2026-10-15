// Accounts: the only code that reads or writes the users, sessions, login_attempts and telegram_links tables
// (telegram_chats and login_codes belong to telegram-bot.js).
// The rest of the server asks through these functions and keeps only a person's id.
import { HttpError, cleanText } from "../lib/http.js";
import { hashPassword, randomHex, sameText, sha256 } from "../lib/crypto.js";

export const SESSION_DAYS = 60;
const MAX_FAILED_LOGINS = 10;          // per username
const LOCK_MINUTES = 15;
const DAY = 86_400_000;

/**
 * What the rest of the app may know about a person (never the password hash or salt).
 * @typedef {{ id: string, username: string, display: string, about: string, email: string,
 *   lang: "fa" | "en", cal: "shamsi" | "gregorian", weekStart: number, plan: string,
 *   hasPassword: boolean, autoMade: boolean, createdAt: number }} User
 */

/** @returns {User | null} */
const toUser = (r) => r && {
  id: r.id, username: r.username, display: r.display_name || "", about: r.about || "", email: r.email || "",
  lang: r.lang, cal: r.cal, weekStart: r.week_start, plan: r.plan,
  hasPassword: r.pass_hash !== null, autoMade: !!r.auto, createdAt: r.created_at,
};

export const cleanUsername = (u) => String(u ?? "").trim().toLowerCase();
export const validUsername = (u) => /^[a-z0-9_]{3,20}$/.test(u);
const validPassword = (p) => typeof p === "string" && p.length >= 6 && p.length <= 200;
const validEmail = (e) => e === "" || (e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

const row = (env, id) => env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
const isTaken = async (env, username) => !!(await env.DB.prepare("SELECT 1 FROM users WHERE username = ?").bind(username).first());
async function passwordMatches(r, password) {
  return r.pass_hash !== null && sameText(await hashPassword(String(password ?? ""), r.salt), r.pass_hash);
}

/** @param {Env} env @param {string} id */
export const getUser = async (env, id) => toUser(await row(env, id));

/** @param {Env} env @param {string} username */
export const findByUsername = async (env, username) =>
  toUser(await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(cleanUsername(username)).first());

/** Several people at once, as id → person. @param {Env} env @param {string[]} ids */
export async function getUsers(env, ids) {
  const list = [...new Set(ids.filter(Boolean))], out = {};
  for (let i = 0; i < list.length; i += 90) {          // D1 takes at most 100 values per query
    const part = list.slice(i, i + 90);
    const { results } = await env.DB.prepare(`SELECT * FROM users WHERE id IN (${part.map(() => "?").join(",")})`).bind(...part).all();
    for (const r of results) out[r.id] = toUser(r);
  }
  return out;
}

/**
 * A new account. password null = made through Telegram, no password yet.
 * @param {Env} env
 * @param {{ username: string, password: string | null, email?: string, lang?: string, display?: string, auto?: boolean }} b
 */
export async function createUser(env, b) {
  const username = cleanUsername(b.username), email = cleanText(b.email, 200), lang = b.lang === "en" ? "en" : "fa";
  if (!validUsername(username)) throw new HttpError("username_invalid");
  if (b.password !== null && !validPassword(b.password)) throw new HttpError("password_short");
  if (!validEmail(email)) throw new HttpError("email_invalid");
  if (await isTaken(env, username)) throw new HttpError("username_taken", 409);
  const id = crypto.randomUUID(), salt = randomHex(16);
  const hash = b.password === null ? null : await hashPassword(b.password, salt);
  try {
    await env.DB.prepare(
      `INSERT INTO users (id, username, pass_hash, salt, display_name, email, lang, cal, week_start, auto, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, username, hash, salt, cleanText(b.display, 40) || null, email || null, lang,
      lang === "fa" ? "shamsi" : "gregorian", lang === "fa" ? 6 : 1, b.auto ? 1 : 0, Date.now()).run();
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new HttpError("username_taken", 409);
    throw e;
  }
  return /** @type {User} */ (await getUser(env, id));
}

/**
 * Profile and settings; fields left out stay as they are.
 * @param {Env} env @param {string} id
 * @param {{ display?: string, about?: string, email?: string, lang?: string, cal?: string, weekStart?: number }} p
 */
export async function updateProfile(env, id, p) {
  const r = await row(env, id);
  if (!r) throw new HttpError("not_found", 404);
  const next = {
    display: p.display === undefined ? r.display_name || "" : cleanText(p.display, 40),
    about: p.about === undefined ? r.about || "" : cleanText(p.about, 160),
    email: p.email === undefined ? r.email || "" : cleanText(p.email, 200),
    lang: p.lang ?? r.lang, cal: p.cal ?? r.cal, weekStart: p.weekStart === undefined ? r.week_start : Number(p.weekStart),
  };
  if (!["fa", "en"].includes(next.lang) || !["shamsi", "gregorian"].includes(next.cal) || ![0, 1, 6].includes(next.weekStart)) throw new HttpError("bad_request");
  if (!validEmail(next.email)) throw new HttpError("email_invalid");
  await env.DB.prepare("UPDATE users SET display_name = ?, about = ?, email = ?, lang = ?, cal = ?, week_start = ? WHERE id = ?")
    .bind(next.display || null, next.about || null, next.email || null, next.lang, next.cal, next.weekStart, id).run();
  return /** @type {User} */ (await getUser(env, id));
}

/** Only the name changes; the id every table points to stays. @param {Env} env @param {string} id @param {string} username @param {string} password */
export async function changeUsername(env, id, username, password) {
  const r = await row(env, id), name = cleanUsername(username);
  if (!r) throw new HttpError("not_found", 404);
  if (r.pass_hash !== null && !(await passwordMatches(r, password))) throw new HttpError("wrong_password", 403);
  if (!validUsername(name)) throw new HttpError("username_invalid");
  if (name === r.username) return name;
  if (await isTaken(env, name)) throw new HttpError("username_taken", 409);
  await env.DB.prepare("UPDATE users SET username = ? WHERE id = ?").bind(name, id).run();
  return name;
}

/** A new password signs out every device. An account with no password yet may set one without `current`. */
export async function changePassword(env, id, current, next) {
  const r = await row(env, id);
  if (!r) throw new HttpError("not_found", 404);
  if (r.pass_hash !== null && !(await passwordMatches(r, current))) throw new HttpError("wrong_password", 403);
  if (!validPassword(next)) throw new HttpError("password_short");
  const salt = randomHex(16);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET pass_hash = ?, salt = ?, auto = 0 WHERE id = ?").bind(await hashPassword(next, salt), salt, id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id),
  ]);
}

/** Checks a username and password, with a lock after too many wrong tries. @returns {Promise<User>} */
export async function checkLogin(env, username, password) {
  const name = cleanUsername(username), key = "login:" + name, t = Date.now();
  const tries = await env.DB.prepare("SELECT count, reset_at FROM login_attempts WHERE key = ?").bind(key).first();
  if (tries && tries.reset_at > t && tries.count >= MAX_FAILED_LOGINS) throw new HttpError("too_many_attempts", 429);
  const r = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(name).first();
  if (!r || !(await passwordMatches(r, password))) {
    await env.DB.prepare(
      `INSERT INTO login_attempts (key, count, reset_at) VALUES (?1, 1, ?2)
       ON CONFLICT(key) DO UPDATE SET
         count    = CASE WHEN reset_at > ?3 THEN count + 1 ELSE 1 END,
         reset_at = CASE WHEN reset_at > ?3 THEN reset_at ELSE ?2 END`
    ).bind(key, t + LOCK_MINUTES * 60_000, t).run();
    throw new HttpError("wrong_login", 401);
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE key = ?").bind(key).run();
  return /** @type {User} */ (toUser(r));
}

/* ---------- sessions: the browser keeps the token in a cookie, we keep only its hash ---------- */

/** @returns {Promise<string>} the token for the cookie */
export async function startSession(env, userId) {
  const token = randomHex(32);
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256(token), userId, Date.now() + SESSION_DAYS * DAY).run();
  return token;
}

const TOKEN_RE = /^[a-f0-9]{64}$/;

/** @returns {Promise<User | null>} */
export async function sessionUser(env, token) {
  if (!TOKEN_RE.test(String(token ?? ""))) return null;
  const r = await env.DB.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?")
    .bind(await sha256(token), Date.now()).first();
  return toUser(r);
}

export async function endSession(env, token) {
  if (TOKEN_RE.test(String(token ?? ""))) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

/* ---------- Telegram links ---------- */

/** @typedef {{ telegramId: string, userId: string, tgUsername: string | null, writeOk: boolean }} TelegramLink */
const toLink = (r) => r && { telegramId: r.telegram_id, userId: r.user_id, tgUsername: r.tg_username, writeOk: !!r.write_ok };

/** @returns {Promise<TelegramLink | null>} */
export const telegramLink = async (env, telegramId) =>
  toLink(await env.DB.prepare("SELECT * FROM telegram_links WHERE telegram_id = ?").bind(String(telegramId)).first());

/** @returns {Promise<TelegramLink | null>} */
export const telegramOfUser = async (env, userId) =>
  toLink(await env.DB.prepare("SELECT * FROM telegram_links WHERE user_id = ?").bind(userId).first());

/**
 * Links a Telegram account to userId, moving it off any other account. An account Telegram made
 * automatically that loses its Telegram is dropped, since nobody could sign in to it any more.
 */
export async function attachTelegram(env, { telegramId, userId, tgUsername = null, writeOk = false }) {
  const tgId = String(telegramId), ops = [];
  const old = await telegramLink(env, tgId);
  if (old && old.userId !== userId) {
    const prev = await row(env, old.userId);
    if (prev && (prev.pass_hash === null || prev.auto)) ops.push(env.DB.prepare("DELETE FROM users WHERE id = ?").bind(prev.id));
  }
  ops.push(
    env.DB.prepare("DELETE FROM telegram_links WHERE user_id = ? OR telegram_id = ?").bind(userId, tgId),
    env.DB.prepare("INSERT INTO telegram_links (telegram_id, user_id, tg_username, write_ok, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(tgId, userId, tgUsername, writeOk ? 1 : 0, Date.now()),
  );
  await env.DB.batch(ops);
}

export async function unlinkTelegram(env, userId) {
  await env.DB.prepare("DELETE FROM telegram_links WHERE user_id = ?").bind(userId).run();
}
