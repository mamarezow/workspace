// In-app notifications (the bell). Later the Telegram bot sends the same ones as messages.
import { newId, parseJson } from "../lib/http.js";

const KEEP = 50;   // the bell shows the latest ones

/** @param {Env} env @param {string} userId @param {string} kind @param {Record<string, unknown>} data */
export async function notify(env, userId, kind, data) {
  await env.DB.prepare("INSERT INTO notifications (id, user_id, kind, data, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(newId("n"), userId, kind, JSON.stringify(data), Date.now()).run();
}

/** @param {Env} env @param {string} userId */
export async function listNotifications(env, userId) {
  const { results } = await env.DB.prepare("SELECT id, kind, data, read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
    .bind(userId, KEEP).all();
  return results.map((r) => ({ id: r.id, kind: r.kind, data: parseJson(/** @type {string} */ (r.data), {}), read: !!r.read, at: r.created_at }));
}

/** @param {Env} env @param {string} userId */
export async function markAllRead(env, userId) {
  await env.DB.prepare("UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0").bind(userId).run();
}

/** Clears the invite notifications for one workspace, once it is answered or withdrawn. */
export async function clearInvite(env, userId, wsId) {
  await env.DB.prepare("DELETE FROM notifications WHERE user_id = ? AND kind = 'invite' AND json_extract(data, '$.ws') = ?").bind(userId, wsId).run();
}
