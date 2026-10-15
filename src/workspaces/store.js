// Workspaces, their members, team roles and invitations.
import { HttpError, cleanText, newId } from "../lib/http.js";
import { randomHex } from "../lib/crypto.js";
import { findByUsername, getUsers } from "../accounts/store.js";
import { clearInvite, notify } from "../notifications/store.js";

export const MAX_MEMBERS = 200;           // only so a link posted somewhere huge cannot flood a workspace
const ONCE_DAYS = 7;
const PALETTE = 8;

const color = (v) => Math.abs(parseInt(v, 10) || 0) % PALETTE;
const cleanIcon = (v) => [...cleanText(v, 16)].slice(0, 2).join("") || null;   // an emoji, maybe with a modifier
/** Every change bumps the workspace's version, so open pages know to reload. */
const bump = (env, wsId) => env.DB.prepare("UPDATE workspaces SET ver = ver + 1 WHERE id = ?").bind(wsId);

/* ---------- workspaces ---------- */

/** The workspaces someone is in, and the ones they are invited to. @param {Env} env @param {string} userId */
export async function listWorkspaces(env, userId) {
  const { results } = await env.DB.prepare(
    `SELECT w.id, w.name, w.icon, m.level, m.status,
            (SELECT COUNT(*) FROM ws_members x WHERE x.ws_id = w.id AND x.status = 'active') AS members
       FROM ws_members m JOIN workspaces w ON w.id = m.ws_id
      WHERE m.user_id = ? ORDER BY m.status, w.created_at`
  ).bind(userId).all();
  return results;
}

/** @param {Env} env @param {{ id: string }} owner @param {{ name?: string, icon?: string }} b */
export async function createWorkspace(env, owner, b) {
  const name = cleanText(b.name, 80);
  if (!name) throw new HttpError("name_empty");
  const id = newId("w"), t = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO workspaces (id, name, icon, owner_id, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, name, cleanIcon(b.icon), owner.id, t),
    env.DB.prepare("INSERT INTO ws_members (ws_id, user_id, level, status, created_at) VALUES (?, ?, 'owner', 'active', ?)").bind(id, owner.id, t),
  ]);
  return id;
}

/** Everything the workspace page needs: the workspace, its members with names and roles, and the roles. */
export async function getWorkspace(env, wsId) {
  const [ws, members, roles, memberRoles] = await env.DB.batch([
    env.DB.prepare("SELECT id, name, icon, ver FROM workspaces WHERE id = ?").bind(wsId),
    env.DB.prepare("SELECT user_id, level, status, created_at FROM ws_members WHERE ws_id = ? ORDER BY created_at").bind(wsId),
    env.DB.prepare("SELECT id, name, color FROM ws_roles WHERE ws_id = ? ORDER BY pos").bind(wsId),
    env.DB.prepare("SELECT user_id, role_id FROM ws_member_roles WHERE ws_id = ?").bind(wsId),
  ]);
  if (!ws.results[0]) throw new HttpError("not_found", 404);
  const who = await getUsers(env, members.results.map((m) => /** @type {string} */ (m.user_id)));
  return {
    workspace: ws.results[0],
    roles: roles.results,
    members: members.results.filter((m) => who[/** @type {string} */ (m.user_id)]).map((m) => {
      const u = who[/** @type {string} */ (m.user_id)];
      return {
        id: u.id, username: u.username, display: u.display, about: u.about,
        level: m.level, status: m.status,
        roles: memberRoles.results.filter((r) => r.user_id === u.id).map((r) => r.role_id),
      };
    }),
  };
}

export const workspaceVersion = async (env, wsId) =>
  /** @type {number | undefined} */ ((await env.DB.prepare("SELECT ver FROM workspaces WHERE id = ?").bind(wsId).first())?.ver);

export async function updateWorkspace(env, wsId, b) {
  const sets = [], vals = [];
  if (b.name !== undefined) {
    const name = cleanText(b.name, 80);
    if (!name) throw new HttpError("name_empty");
    sets.push("name = ?"); vals.push(name);
  }
  if (b.icon !== undefined) { sets.push("icon = ?"); vals.push(cleanIcon(b.icon)); }
  if (!sets.length) return;
  await env.DB.prepare(`UPDATE workspaces SET ${sets.join(", ")}, ver = ver + 1 WHERE id = ?`).bind(...vals, wsId).run();
}

export async function deleteWorkspace(env, wsId) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM notifications WHERE kind = 'invite' AND json_extract(data, '$.ws') = ?").bind(wsId),
    env.DB.prepare("DELETE FROM workspaces WHERE id = ?").bind(wsId),     // members, roles and links go with it
  ]);
}

/* ---------- members ---------- */

const memberRow = (env, wsId, userId) =>
  env.DB.prepare("SELECT level, status FROM ws_members WHERE ws_id = ? AND user_id = ?").bind(wsId, userId).first();

async function activeCount(env, wsId) {
  return /** @type {number} */ ((await env.DB.prepare("SELECT COUNT(*) AS n FROM ws_members WHERE ws_id = ? AND status = 'active'").bind(wsId).first()).n);
}

/** Invites someone by username: they see it under the bell and accept or decline. */
export async function inviteByUsername(env, wsId, by, username) {
  const target = await findByUsername(env, username);
  if (!target) throw new HttpError("no_such_user", 404);
  const has = await memberRow(env, wsId, target.id);
  if (has) throw new HttpError(has.status === "pending" ? "already_invited" : "already_member", 409);
  if ((await activeCount(env, wsId)) >= MAX_MEMBERS) throw new HttpError("workspace_full", 403);
  const ws = await env.DB.prepare("SELECT name FROM workspaces WHERE id = ?").bind(wsId).first();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO ws_members (ws_id, user_id, level, status, invited_by, created_at) VALUES (?, ?, 'member', 'pending', ?, ?)")
      .bind(wsId, target.id, by.id, Date.now()),
    bump(env, wsId),
  ]);
  await notify(env, target.id, "invite", { ws: wsId, wsName: ws.name, by: by.id, byName: by.display || by.username });
}

export async function answerInvite(env, wsId, userId, accept) {
  const m = await memberRow(env, wsId, userId);
  if (!m || m.status !== "pending") throw new HttpError("no_invite", 404);
  if (accept && (await activeCount(env, wsId)) >= MAX_MEMBERS) throw new HttpError("workspace_full", 403);
  await env.DB.batch([
    accept
      ? env.DB.prepare("UPDATE ws_members SET status = 'active' WHERE ws_id = ? AND user_id = ?").bind(wsId, userId)
      : env.DB.prepare("DELETE FROM ws_members WHERE ws_id = ? AND user_id = ?").bind(wsId, userId),
    bump(env, wsId),
  ]);
  await clearInvite(env, userId, wsId);
}

/** Owner only: make someone an admin or a plain member. The owner's own level never changes here. */
export async function setLevel(env, wsId, userId, level) {
  if (!["admin", "member"].includes(level)) throw new HttpError("bad_request");
  const t = await memberRow(env, wsId, userId);
  if (!t || t.status !== "active" || t.level === "owner") throw new HttpError("not_allowed", 403);
  await env.DB.batch([
    env.DB.prepare("UPDATE ws_members SET level = ? WHERE ws_id = ? AND user_id = ?").bind(level, wsId, userId),
    bump(env, wsId),
  ]);
}

/** Admins remove members (or withdraw invites); only the owner removes admins; nobody removes the owner. */
export async function removeMember(env, wsId, byLevel, userId) {
  const t = await memberRow(env, wsId, userId);
  if (!t) throw new HttpError("not_found", 404);
  if (t.level === "owner" || (t.level === "admin" && byLevel !== "owner")) throw new HttpError("not_allowed", 403);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM ws_members WHERE ws_id = ? AND user_id = ?").bind(wsId, userId),
    bump(env, wsId),
  ]);
  await clearInvite(env, userId, wsId);
}

export async function leave(env, wsId, userId, level) {
  if (level === "owner") throw new HttpError("owner_cannot_leave");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM ws_members WHERE ws_id = ? AND user_id = ?").bind(wsId, userId),
    bump(env, wsId),
  ]);
}

/* ---------- team roles ---------- */

export async function addRole(env, wsId, b) {
  const name = cleanText(b.name, 40);
  if (!name) throw new HttpError("name_empty");
  const top = await env.DB.prepare("SELECT COALESCE(MAX(pos), 0) AS p FROM ws_roles WHERE ws_id = ?").bind(wsId).first();
  const id = newId("r");
  await env.DB.batch([
    env.DB.prepare("INSERT INTO ws_roles (id, ws_id, name, color, pos) VALUES (?, ?, ?, ?, ?)").bind(id, wsId, name, color(b.color), /** @type {number} */ (top.p) + 1),
    bump(env, wsId),
  ]);
  return id;
}

export async function updateRole(env, wsId, roleId, b) {
  const name = b.name === undefined ? undefined : cleanText(b.name, 40);
  if (name === "") throw new HttpError("name_empty");
  const r = await env.DB.prepare("UPDATE ws_roles SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ? AND ws_id = ?")
    .bind(name ?? null, b.color === undefined ? null : color(b.color), roleId, wsId).run();
  if (!r.meta.changes) throw new HttpError("not_found", 404);
  await bump(env, wsId).run();
}

export async function deleteRole(env, wsId, roleId) {
  const r = await env.DB.prepare("DELETE FROM ws_roles WHERE id = ? AND ws_id = ?").bind(roleId, wsId).run();
  if (!r.meta.changes) throw new HttpError("not_found", 404);
  await bump(env, wsId).run();
}

/** Sets which team roles a member has (replacing the old set). */
export async function setMemberRoles(env, wsId, userId, roleIds) {
  if (!Array.isArray(roleIds)) throw new HttpError("bad_request");
  const t = await memberRow(env, wsId, userId);
  if (!t || t.status !== "active") throw new HttpError("not_found", 404);
  const { results } = await env.DB.prepare("SELECT id FROM ws_roles WHERE ws_id = ?").bind(wsId).all();
  const valid = new Set(results.map((r) => r.id));
  const ids = [...new Set(roleIds.map(String))].filter((id) => valid.has(id));
  await env.DB.batch([
    env.DB.prepare("DELETE FROM ws_member_roles WHERE ws_id = ? AND user_id = ?").bind(wsId, userId),
    ...ids.map((id) => env.DB.prepare("INSERT INTO ws_member_roles (ws_id, user_id, role_id) VALUES (?, ?, ?)").bind(wsId, userId, id)),
    bump(env, wsId),
  ]);
}

/* ---------- invite links ---------- */

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

/** The lasting link (made the first time it is asked for); reset = a new token, so the old link stops working. */
export async function lastingLink(env, wsId, by, reset = false) {
  const has = await env.DB.prepare("SELECT token, slug FROM ws_links WHERE ws_id = ?").bind(wsId).first();
  if (has && !reset) return { token: has.token, slug: has.slug };
  const token = randomHex(12);
  await env.DB.prepare(
    `INSERT INTO ws_links (token, ws_id, slug, created_by, created_at) VALUES (?, ?, NULL, ?, ?)
     ON CONFLICT(ws_id) DO UPDATE SET token = excluded.token, created_by = excluded.created_by, created_at = excluded.created_at`
  ).bind(token, wsId, by, Date.now()).run();
  return { token, slug: has?.slug ?? null };
}

/** A readable name for the lasting link, like /join/our-team. Empty clears it. */
export async function setSlug(env, wsId, by, slug) {
  const s = cleanText(slug, 32).toLowerCase();
  if (s && !SLUG_RE.test(s)) throw new HttpError("slug_invalid");
  await lastingLink(env, wsId, by);
  try {
    await env.DB.prepare("UPDATE ws_links SET slug = ? WHERE ws_id = ?").bind(s || null, wsId).run();
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new HttpError("slug_taken", 409);
    throw e;
  }
  return s || null;
}

export async function onceLink(env, wsId, by) {
  const token = randomHex(12);
  await env.DB.prepare("INSERT INTO ws_once (token, ws_id, created_by, created_at) VALUES (?, ?, ?, ?)").bind(token, wsId, by, Date.now()).run();
  return token;
}

/** Which workspace a link points to; once = it is a one-person link. */
async function resolveLink(env, code) {
  const c = String(code ?? "").toLowerCase();
  const lasting = await env.DB.prepare("SELECT ws_id FROM ws_links WHERE token = ? OR slug = ?").bind(c, c).first();
  if (lasting) return { wsId: /** @type {string} */ (lasting.ws_id), once: null };
  const once = await env.DB.prepare("SELECT ws_id, created_at FROM ws_once WHERE token = ?").bind(c).first();
  if (once && Date.now() - /** @type {number} */ (once.created_at) < ONCE_DAYS * 86_400_000) return { wsId: /** @type {string} */ (once.ws_id), once: c };
  throw new HttpError("link_invalid", 404);
}

/** What a link shows before joining: the workspace's name and whether this person is already in. */
export async function previewLink(env, code, userId) {
  const { wsId } = await resolveLink(env, code);
  const ws = await env.DB.prepare("SELECT id, name, icon FROM workspaces WHERE id = ?").bind(wsId).first();
  const m = await memberRow(env, wsId, userId);
  return { workspace: ws, members: await activeCount(env, wsId), member: m?.status === "active" };
}

/** Joins through a link. A pending invite turns active; a one-person link is used up. */
export async function joinByLink(env, code, user) {
  const { wsId, once } = await resolveLink(env, code);
  const m = await memberRow(env, wsId, user.id);
  if (m?.status === "active") return wsId;
  if ((await activeCount(env, wsId)) >= MAX_MEMBERS) throw new HttpError("workspace_full", 403);
  const ops = [
    m ? env.DB.prepare("UPDATE ws_members SET status = 'active' WHERE ws_id = ? AND user_id = ?").bind(wsId, user.id)
      : env.DB.prepare("INSERT INTO ws_members (ws_id, user_id, level, status, created_at) VALUES (?, ?, 'member', 'active', ?)").bind(wsId, user.id, Date.now()),
    bump(env, wsId),
  ];
  if (once) ops.push(env.DB.prepare("DELETE FROM ws_once WHERE token = ?").bind(once));
  await env.DB.batch(ops);
  if (m) await clearInvite(env, user.id, wsId);
  return wsId;
}
