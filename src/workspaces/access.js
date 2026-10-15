// Who may do what in a workspace. Every workspace route starts by calling need().
//   member: sees every tab, answers events, moves tasks (each tab adds its own rules)
//   admin:  also invites and removes members, defines team roles, changes tab settings
//   owner:  everything, plus renaming or deleting the workspace and making or unmaking admins
import { HttpError } from "../lib/http.js";

/** @typedef {"owner" | "admin" | "member"} Level */
export const LEVELS = /** @type {const} */ (["member", "admin", "owner"]);
const RANK = { member: 1, admin: 2, owner: 3 };

/** @param {Level} a @param {Level} b */
export const atLeast = (a, b) => RANK[a] >= RANK[b];

/**
 * The person's membership, or an error: not_found if they are not an active member
 * (so a workspace's existence is not revealed), not_allowed if their level is too low.
 * @param {Env} env @param {string} wsId @param {string} userId @param {Level} [level]
 * @returns {Promise<{ level: Level }>}
 */
export async function need(env, wsId, userId, level = "member") {
  const m = await env.DB.prepare("SELECT level, status FROM ws_members WHERE ws_id = ? AND user_id = ?").bind(wsId, userId).first();
  if (!m || m.status !== "active") throw new HttpError("not_found", 404);
  if (!atLeast(/** @type {Level} */ (m.level), level)) throw new HttpError("not_allowed", 403);
  return { level: /** @type {Level} */ (m.level) };
}
