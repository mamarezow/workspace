// Clusters: kanban boards inside a workspace. Who may do what in one cluster:
//   member: sees it, moves tasks between columns, ticks checklist steps
//   admin:  also adds, edits and deletes tasks, fields and columns; adds and removes members
//   owner:  everything, plus renaming or deleting the cluster and making or unmaking admins
// Members come from the workspace: an admin adds a workspace member straight in (the workspace already did the inviting).
import { HttpError, cleanText, newId, parseJson } from "../lib/http.js";
import { randomHex } from "../lib/crypto.js";
import { getUsers } from "../accounts/store.js";
import { notify } from "../notifications/store.js";

/** @typedef {"owner" | "admin" | "member"} Role */
const RANK = { member: 1, admin: 2, owner: 3 };
export const TYPES = ["text", "number", "phone", "link", "select", "assign", "date", "check", "checklist"];
const DEFAULT_COLUMNS = {
  fa: [["انجام‌نشده", 7], ["در حال انجام", 4], ["انجام‌شده", 2]],
  en: [["To do", 7], ["Doing", 4], ["Done", 2]],
};
const PALETTE = 8;
const MAX_STEPS = 50, MAX_OPTIONS = 50;

const color = (v) => Math.abs(parseInt(v, 10) || 0) % PALETTE;
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
/** Every change bumps the cluster's version, so open pages know to reload. */
const bump = (env, id) => env.DB.prepare("UPDATE clusters SET ver = ver + 1 WHERE id = ?").bind(id);

/**
 * The person's place in a cluster of this workspace, or not_found (also when the cluster is in another workspace).
 * @param {Env} env @param {string} wsId @param {string} id @param {string} userId @param {Role} [role]
 * @returns {Promise<{ role: Role, color: number }>}
 */
export async function needIn(env, wsId, id, userId, role = "member") {
  const m = await env.DB.prepare(
    "SELECT m.role, m.color FROM cluster_members m JOIN clusters c ON c.id = m.cluster_id WHERE m.cluster_id = ? AND c.ws_id = ? AND m.user_id = ?"
  ).bind(id, wsId, userId).first();
  if (!m) throw new HttpError("not_found", 404);
  if (RANK[/** @type {Role} */ (m.role)] < RANK[role]) throw new HttpError("not_allowed", 403);
  return { role: /** @type {Role} */ (m.role), color: /** @type {number} */ (m.color) };
}

/* ---------- clusters ---------- */

/** The clusters of a workspace this person is in, each with its members and task count. */
export async function listClusters(env, wsId, userId) {
  const [rows, people] = await env.DB.batch([
    env.DB.prepare(
      `SELECT c.id, c.name, m.role, m.color, (SELECT COUNT(*) FROM cluster_tasks t WHERE t.cluster_id = c.id) AS tasks
         FROM cluster_members m JOIN clusters c ON c.id = m.cluster_id
        WHERE c.ws_id = ? AND m.user_id = ? ORDER BY c.created_at`
    ).bind(wsId, userId),
    env.DB.prepare(
      `SELECT x.cluster_id, x.user_id FROM cluster_members x
        WHERE x.cluster_id IN (SELECT cluster_id FROM cluster_members WHERE ws_id = ? AND user_id = ?) ORDER BY x.created_at`
    ).bind(wsId, userId),
  ]);
  return rows.results.map((c) => ({ ...c, members: people.results.filter((p) => p.cluster_id === c.id).map((p) => p.user_id) }));
}

/** @param {Env} env @param {string} wsId @param {{ id: string, lang: string }} u @param {{ name?: string }} b */
export async function createCluster(env, wsId, u, b) {
  const name = cleanText(b.name, 80);
  if (!name) throw new HttpError("name_empty");
  const id = newId("c"), t = Date.now();
  const mine = await env.DB.prepare("SELECT COUNT(*) AS n FROM cluster_members WHERE ws_id = ? AND user_id = ?").bind(wsId, u.id).first();
  const cols = DEFAULT_COLUMNS[u.lang === "en" ? "en" : "fa"].map(([n, c], i) => ({ id: newId("k"), name: n, color: c, pos: i + 1 }));
  await env.DB.batch([
    env.DB.prepare("INSERT INTO clusters (id, ws_id, name, created_by, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, wsId, name, u.id, t),
    env.DB.prepare("INSERT INTO cluster_members (cluster_id, ws_id, user_id, role, color, created_at) VALUES (?, ?, ?, 'owner', ?, ?)")
      .bind(id, wsId, u.id, /** @type {number} */ (mine.n) % PALETTE, t),
    ...cols.map((k) => env.DB.prepare("INSERT INTO cluster_columns (id, cluster_id, name, color, pos) VALUES (?, ?, ?, ?, ?)").bind(k.id, id, k.name, k.color, k.pos)),
  ]);
  return id;
}

/** Everything one cluster's page needs. */
export async function getCluster(env, id) {
  const [c, members, columns, fields, tasks] = await env.DB.batch([
    env.DB.prepare("SELECT id, name, ver FROM clusters WHERE id = ?").bind(id),
    env.DB.prepare("SELECT user_id, role, color FROM cluster_members WHERE cluster_id = ? ORDER BY created_at").bind(id),
    env.DB.prepare("SELECT id, name, color, pos FROM cluster_columns WHERE cluster_id = ? ORDER BY pos").bind(id),
    env.DB.prepare("SELECT id, name, type, opts, multi, pos FROM cluster_fields WHERE cluster_id = ? ORDER BY pos").bind(id),
    env.DB.prepare("SELECT id, col_id AS col, name, pos, vals FROM cluster_tasks WHERE cluster_id = ? ORDER BY pos").bind(id),
  ]);
  if (!c.results[0]) throw new HttpError("not_found", 404);
  const who = await getUsers(env, members.results.map((m) => /** @type {string} */ (m.user_id)));
  return {
    cluster: c.results[0],
    members: members.results.filter((m) => who[/** @type {string} */ (m.user_id)]).map((m) => {
      const u = who[/** @type {string} */ (m.user_id)];
      return { id: u.id, username: u.username, display: u.display, role: m.role };
    }),
    columns: columns.results,
    fields: fields.results.map((f) => ({ ...f, opts: parseJson(/** @type {string} */ (f.opts), []), multi: !!f.multi })),
    tasks: tasks.results.map((t) => ({ ...t, vals: parseJson(/** @type {string} */ (t.vals), {}) })),
  };
}

/**
 * One short text that changes whenever any cluster this person is in changes, or they join or leave one:
 * the open page asks for it with the workspace's version, in the same small request.
 */
export async function clustersMark(env, wsId, userId) {
  const r = await env.DB.prepare(
    `SELECT group_concat(id || '.' || ver) AS mark FROM
       (SELECT c.id, c.ver FROM clusters c JOIN cluster_members m ON m.cluster_id = c.id
         WHERE c.ws_id = ? AND m.user_id = ? ORDER BY c.id)`
  ).bind(wsId, userId).first();
  return /** @type {string} */ (r?.mark ?? "");
}

export async function renameCluster(env, id, name) {
  const n = cleanText(name, 80);
  if (!n) throw new HttpError("name_empty");
  await env.DB.prepare("UPDATE clusters SET name = ?, ver = ver + 1 WHERE id = ?").bind(n, id).run();
}

export async function deleteCluster(env, id) {
  await env.DB.prepare("DELETE FROM clusters WHERE id = ?").bind(id).run();   // its members, columns, fields and tasks go with it
}

/** Your own colour for this cluster (the list shows each cluster in it). */
export async function setMyColor(env, id, userId, c) {
  await env.DB.prepare("UPDATE cluster_members SET color = ? WHERE cluster_id = ? AND user_id = ?").bind(color(c), id, userId).run();
}

export async function leaveCluster(env, id, userId, role) {
  if (role === "owner") throw new HttpError("owner_cannot_leave");
  await env.DB.batch([env.DB.prepare("DELETE FROM cluster_members WHERE cluster_id = ? AND user_id = ?").bind(id, userId), bump(env, id)]);
}

/**
 * Clusters whose owner has left the workspace pass to the workspace's owner, so none is left without one.
 * Called after someone leaves or is removed from a workspace.
 */
export async function adoptOrphans(env, wsId) {
  const { results } = await env.DB.prepare(
    "SELECT id FROM clusters c WHERE ws_id = ? AND NOT EXISTS (SELECT 1 FROM cluster_members m WHERE m.cluster_id = c.id AND m.role = 'owner')"
  ).bind(wsId).all();
  if (!results.length) return;
  const ws = await env.DB.prepare("SELECT owner_id FROM workspaces WHERE id = ?").bind(wsId).first();
  const t = Date.now();
  await env.DB.batch(results.flatMap((c) => [
    env.DB.prepare(
      `INSERT INTO cluster_members (cluster_id, ws_id, user_id, role, color, created_at) VALUES (?, ?, ?, 'owner', 0, ?)
       ON CONFLICT (cluster_id, user_id) DO UPDATE SET role = 'owner'`
    ).bind(c.id, wsId, ws.owner_id, t),
    bump(env, c.id),
  ]));
}

/* ---------- members ---------- */

/** An admin adds someone from the workspace; they hear about it under the bell. */
export async function addMember(env, wsId, id, by, userId) {
  const inWs = await env.DB.prepare("SELECT status FROM ws_members WHERE ws_id = ? AND user_id = ?").bind(wsId, String(userId ?? "")).first();
  if (!inWs || inWs.status !== "active") throw new HttpError("not_in_workspace", 404);
  const has = await env.DB.prepare("SELECT 1 FROM cluster_members WHERE cluster_id = ? AND user_id = ?").bind(id, userId).first();
  if (has) throw new HttpError("already_member", 409);
  const mine = await env.DB.prepare("SELECT COUNT(*) AS n FROM cluster_members WHERE ws_id = ? AND user_id = ?").bind(wsId, userId).first();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO cluster_members (cluster_id, ws_id, user_id, role, color, created_at) VALUES (?, ?, ?, 'member', ?, ?)")
      .bind(id, wsId, userId, /** @type {number} */ (mine.n) % PALETTE, Date.now()),
    bump(env, id),
  ]);
  const c = await env.DB.prepare("SELECT name FROM clusters WHERE id = ?").bind(id).first();
  await notify(env, userId, "cluster_added", { ws: wsId, cluster: id, clusterName: c.name, by: by.id, byName: by.display || by.username });
}

export async function setRole(env, id, userId, role) {
  if (role !== "admin" && role !== "member") throw new HttpError("bad_request");
  const t = await env.DB.prepare("SELECT role FROM cluster_members WHERE cluster_id = ? AND user_id = ?").bind(id, userId).first();
  if (!t) throw new HttpError("not_found", 404);
  if (t.role === "owner") throw new HttpError("not_allowed", 403);
  await env.DB.batch([env.DB.prepare("UPDATE cluster_members SET role = ? WHERE cluster_id = ? AND user_id = ?").bind(role, id, userId), bump(env, id)]);
}

/** Admins remove members; only the owner removes admins; nobody removes the owner. */
export async function removeMember(env, id, myRole, userId) {
  const t = await env.DB.prepare("SELECT role FROM cluster_members WHERE cluster_id = ? AND user_id = ?").bind(id, userId).first();
  if (!t) throw new HttpError("not_found", 404);
  if (t.role === "owner" || (t.role === "admin" && myRole !== "owner")) throw new HttpError("not_allowed", 403);
  await env.DB.batch([env.DB.prepare("DELETE FROM cluster_members WHERE cluster_id = ? AND user_id = ?").bind(id, userId), bump(env, id)]);
}

/* ---------- columns ---------- */

export async function addColumn(env, id, b) {
  const top = await env.DB.prepare("SELECT COALESCE(MAX(pos), 0) AS p FROM cluster_columns WHERE cluster_id = ?").bind(id).first();
  const cid = newId("k");
  await env.DB.batch([
    env.DB.prepare("INSERT INTO cluster_columns (id, cluster_id, name, color, pos) VALUES (?, ?, ?, ?, ?)")
      .bind(cid, id, cleanText(b.name, 60) || "—", color(b.color), /** @type {number} */ (top.p) + 1),
    bump(env, id),
  ]);
  return cid;
}

export async function editColumn(env, id, cid, b) {
  const c = await env.DB.prepare("SELECT name, color, pos FROM cluster_columns WHERE id = ? AND cluster_id = ?").bind(cid, id).first();
  if (!c) throw new HttpError("not_found", 404);
  await env.DB.batch([
    env.DB.prepare("UPDATE cluster_columns SET name = ?, color = ?, pos = ? WHERE id = ?").bind(
      b.name !== undefined ? cleanText(b.name, 60) || c.name : c.name,
      b.color !== undefined ? color(b.color) : c.color,
      Number.isFinite(b.pos) ? b.pos : c.pos, cid),
    bump(env, id),
  ]);
}

/** Deleting a column deletes its tasks; a cluster keeps at least one column. */
export async function deleteColumn(env, id, cid) {
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM cluster_columns WHERE cluster_id = ?").bind(id).first();
  if (/** @type {number} */ (n.n) <= 1) throw new HttpError("last_column");
  const r = await env.DB.batch([env.DB.prepare("DELETE FROM cluster_columns WHERE id = ? AND cluster_id = ?").bind(cid, id), bump(env, id)]);
  if (!r[0].meta.changes) throw new HttpError("not_found", 404);
}

/* ---------- fields ---------- */

function cleanOptions(opts) {
  if (!Array.isArray(opts)) return [];
  return opts.slice(0, MAX_OPTIONS).filter(isObj).map((o) => ({
    id: /^[a-z0-9]{2,24}$/i.test(o.id) ? o.id : newId("o"),
    name: cleanText(o.name, 60) || "—",
    color: color(o.color),
  }));
}

export async function addField(env, id, b) {
  if (!TYPES.includes(b.type)) throw new HttpError("bad_request");
  const name = cleanText(b.name, 60);
  if (!name) throw new HttpError("name_empty");
  const top = await env.DB.prepare("SELECT COALESCE(MAX(pos), 0) AS p FROM cluster_fields WHERE cluster_id = ?").bind(id).first();
  const fid = newId("f");
  const multi = b.type === "assign" || (b.type === "select" && !!b.multi);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO cluster_fields (id, cluster_id, name, type, opts, multi, pos) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(fid, id, name, b.type, JSON.stringify(b.type === "select" ? cleanOptions(b.opts) : []), multi ? 1 : 0, /** @type {number} */ (top.p) + 1),
    bump(env, id),
  ]);
  return fid;
}

export async function editField(env, id, fid, b) {
  const f = await env.DB.prepare("SELECT name, type, opts, multi FROM cluster_fields WHERE id = ? AND cluster_id = ?").bind(fid, id).first();
  if (!f) throw new HttpError("not_found", 404);
  const select = f.type === "select";
  await env.DB.batch([
    env.DB.prepare("UPDATE cluster_fields SET name = ?, opts = ?, multi = ? WHERE id = ?").bind(
      b.name !== undefined ? cleanText(b.name, 60) || f.name : f.name,
      b.opts !== undefined && select ? JSON.stringify(cleanOptions(b.opts)) : f.opts,
      b.multi !== undefined && select ? (b.multi ? 1 : 0) : f.multi, fid),
    bump(env, id),
  ]);
}

/** Deleting a field also clears its values from every task. */
export async function deleteField(env, id, fid) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM cluster_fields WHERE id = ? AND cluster_id = ?").bind(fid, id),
    env.DB.prepare("UPDATE cluster_tasks SET vals = json_remove(vals, '$.' || ?) WHERE cluster_id = ?").bind(fid, id),
    bump(env, id),
  ]);
}

/* ---------- tasks ---------- */

export async function addTask(env, id, userId, b) {
  const name = cleanText(b.name, 300);
  if (!name) throw new HttpError("name_empty");
  const col = await env.DB.prepare("SELECT id FROM cluster_columns WHERE id = ? AND cluster_id = ?").bind(String(b.col ?? ""), id).first();
  if (!col) throw new HttpError("not_found", 404);
  const top = await env.DB.prepare("SELECT COALESCE(MAX(pos), 0) AS p FROM cluster_tasks WHERE cluster_id = ? AND col_id = ?").bind(id, col.id).first();
  const tid = newId("t"), pos = /** @type {number} */ (top.p) + 1, t = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO cluster_tasks (id, cluster_id, col_id, name, pos, vals, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '{}', ?, ?, ?)")
      .bind(tid, id, col.id, name, pos, userId, t, t),
    bump(env, id),
  ]);
  return { id: tid, pos };
}

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const REMINDERS = ["none", "before", "same"];

/**
 * What a field accepts; anything else (or empty) clears the value, shown as undefined.
 * @param {{ type: string, opts: string | any[], multi: number | boolean }} f @param {unknown} v @param {Set<string>} memberIds
 */
export function cleanValue(f, v, memberIds) {
  if (v === null || v === undefined || v === "") return undefined;
  switch (f.type) {
    case "text": return cleanText(v, 5000) || undefined;
    case "number": { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
    case "phone": return String(v).replace(/[^\d+\-\s()]/g, "").trim().slice(0, 40) || undefined;
    case "link": {
      const s = cleanText(v, 2000);
      if (!s) return undefined;
      return /^https?:\/\//i.test(s) ? s : "https://" + s;
    }
    case "select": {
      const ok = new Set((typeof f.opts === "string" ? parseJson(f.opts, []) : f.opts).map((o) => o.id));
      const picked = [...new Set([].concat(v).filter((x) => ok.has(x)))];
      const out = f.multi ? picked : picked.slice(0, 1);
      return out.length ? out : undefined;
    }
    case "assign": {
      const out = [...new Set([].concat(v).filter((x) => memberIds.has(x)))];
      return out.length ? out : undefined;
    }
    case "check": return v === true || v === 1 || v === "1" ? true : undefined;
    // small steps: [{ id, t: text, d: done }]
    case "checklist": {
      if (!Array.isArray(v)) return undefined;
      const out = v.slice(0, MAX_STEPS)
        .map((x) => ({ id: typeof x?.id === "string" && /^[a-z0-9]{4,16}$/.test(x.id) ? x.id : randomHex(4), t: cleanText(x?.t, 200), d: !!x?.d }))
        .filter((x) => x.t);
      return out.length ? out : undefined;
    }
    // a gregorian YYYY-MM-DD (each person sees it in their own calendar), with when to remind: { d, r: none | before | same }
    case "date": {
      const raw = isObj(v) ? /** @type {any} */ (v).d : v, d = String(raw ?? "").trim();
      if (!DATE.test(d) || new Date(d + "T00:00:00Z").toISOString().slice(0, 10) !== d) return undefined;   // no 31 February
      const r = isObj(v) && REMINDERS.includes(/** @type {any} */ (v).r) ? /** @type {any} */ (v).r : "none";
      return { d, r };
    }
  }
  return undefined;
}

/** Edits a task's name and values; people newly assigned to it hear about it. */
export async function editTask(env, wsId, id, tid, by, b) {
  const t = await env.DB.prepare("SELECT name, vals FROM cluster_tasks WHERE id = ? AND cluster_id = ?").bind(tid, id).first();
  if (!t) throw new HttpError("not_found", 404);
  const vals = parseJson(/** @type {string} */ (t.vals), {});
  const newlyAssigned = new Set();
  if (isObj(b.vals)) {
    const [fields, members] = await env.DB.batch([
      env.DB.prepare("SELECT id, type, opts, multi FROM cluster_fields WHERE cluster_id = ?").bind(id),
      env.DB.prepare("SELECT user_id FROM cluster_members WHERE cluster_id = ?").bind(id),
    ]);
    const memberIds = new Set(members.results.map((r) => /** @type {string} */ (r.user_id)));
    for (const [fid, v] of Object.entries(b.vals)) {
      const f = /** @type {any} */ (fields.results.find((x) => x.id === fid));
      if (!f) continue;
      const clean = cleanValue(f, v, memberIds);
      if (f.type === "assign") for (const x of /** @type {string[]} */ (clean || [])) if (!(vals[fid] || []).includes(x) && x !== by.id) newlyAssigned.add(x);
      if (clean === undefined) delete vals[fid]; else vals[fid] = clean;
    }
  }
  const name = b.name !== undefined ? cleanText(b.name, 300) || t.name : t.name;
  await env.DB.batch([
    env.DB.prepare("UPDATE cluster_tasks SET name = ?, vals = ?, updated_at = ? WHERE id = ?").bind(name, JSON.stringify(vals), Date.now(), tid),
    bump(env, id),
  ]);
  if (newlyAssigned.size) {
    const c = await env.DB.prepare("SELECT name FROM clusters WHERE id = ?").bind(id).first();
    for (const x of newlyAssigned) {
      await notify(env, x, "assign", { ws: wsId, cluster: id, clusterName: c.name, task: tid, taskName: name, by: by.id, byName: by.display || by.username });
    }
  }
  return vals;
}

/** Puts a task in a column at a position (between its new neighbours). Every member may do this. */
export async function moveTask(env, id, tid, b) {
  const col = await env.DB.prepare("SELECT id FROM cluster_columns WHERE id = ? AND cluster_id = ?").bind(String(b.col ?? ""), id).first();
  if (!col || !Number.isFinite(b.pos)) throw new HttpError("bad_request");
  const r = await env.DB.batch([
    env.DB.prepare("UPDATE cluster_tasks SET col_id = ?, pos = ?, updated_at = ? WHERE id = ? AND cluster_id = ?").bind(col.id, b.pos, Date.now(), tid, id),
    bump(env, id),
  ]);
  if (!r[0].meta.changes) throw new HttpError("not_found", 404);
}

/** Ticks or unticks one checklist step. Every member may do this. */
export async function tickStep(env, id, tid, b) {
  const [f, t] = await env.DB.batch([
    env.DB.prepare("SELECT id FROM cluster_fields WHERE id = ? AND cluster_id = ? AND type = 'checklist'").bind(String(b.field ?? ""), id),
    env.DB.prepare("SELECT vals FROM cluster_tasks WHERE id = ? AND cluster_id = ?").bind(tid, id),
  ]);
  const field = f.results[0], task = t.results[0];
  if (!field || !task) throw new HttpError("not_found", 404);
  const vals = parseJson(/** @type {string} */ (task.vals), {});
  const step = (Array.isArray(vals[field.id]) ? vals[field.id] : []).find((x) => x.id === String(b.item));
  if (!step) throw new HttpError("not_found", 404);
  step.d = !!b.done;
  await env.DB.batch([
    env.DB.prepare("UPDATE cluster_tasks SET vals = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(vals), Date.now(), tid),
    bump(env, id),
  ]);
  return vals;
}

export async function deleteTask(env, id, tid) {
  await env.DB.batch([env.DB.prepare("DELETE FROM cluster_tasks WHERE id = ? AND cluster_id = ?").bind(tid, id), bump(env, id)]);
}
