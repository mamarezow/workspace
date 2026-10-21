import { test, expect } from "@playwright/test";
import { signedUp } from "./helpers.mjs";

/** a workspace owned by `owner` with `others` as active members */
async function workspaceWith(owner, ...others) {
  const id = (await owner.post("/api/ws", { name: "تیم" })).body.id;
  for (const p of others) {
    await owner.post(`/api/ws/${id}/invites`, { username: p.username });
    await p.post(`/api/ws/${id}/invite/accept`);
  }
  return id;
}
const clusterOf = async (p, ws, name = "انتشارات") => {
  const r = await p.post(`/api/ws/${ws}/clusters`, { name });
  expect(r.status).toBe(200);
  return `/api/ws/${ws}/clusters/${r.body.id}`;
};

test("a new cluster has its maker as owner and three default columns", async () => {
  const a = await signedUp();
  const ws = await workspaceWith(a);
  const url = await clusterOf(a, ws);
  const c = (await a.get(url)).body;
  expect(c.cluster.name).toBe("انتشارات");
  expect(c.me).toEqual(expect.objectContaining({ id: a.user.id, role: "owner" }));
  expect(c.columns.map((k) => k.name)).toEqual(["انجام‌نشده", "در حال انجام", "انجام‌شده"]);
  expect(c.members).toEqual([expect.objectContaining({ id: a.user.id, role: "owner" })]);
  const list = (await a.get(`/api/ws/${ws}/clusters`)).body.clusters;
  expect(list).toEqual([expect.objectContaining({ name: "انتشارات", role: "owner", tasks: 0, members: [a.user.id] })]);
  expect((await a.post(`/api/ws/${ws}/clusters`, { name: " " })).body.error).toBe("name_empty");
});

test("only workspace members, and only cluster members, see a cluster", async () => {
  const a = await signedUp(), b = await signedUp(), out = await signedUp();
  const ws = await workspaceWith(a, b);
  const url = await clusterOf(a, ws);
  expect((await out.get(`/api/ws/${ws}/clusters`)).status).toBe(404);
  expect((await out.get(url)).status).toBe(404);
  expect((await b.get(url)).status).toBe(404);                         // in the workspace, not in the cluster
  expect((await b.get(`/api/ws/${ws}/clusters`)).body.clusters).toEqual([]);
  // the same cluster through another workspace's address is not found either
  const ws2 = await workspaceWith(b);
  expect((await a.get(url.replace(ws, ws2))).status).toBe(404);
});

test("admins add workspace members; roles decide who may edit", async () => {
  const a = await signedUp(), b = await signedUp(), c = await signedUp(), out = await signedUp();
  const ws = await workspaceWith(a, b, c);
  const url = await clusterOf(a, ws);
  expect((await a.post(`${url}/members`, { user: out.user.id })).body.error).toBe("not_in_workspace");
  expect((await a.post(`${url}/members`, { user: b.user.id })).status).toBe(200);
  expect((await a.post(`${url}/members`, { user: b.user.id })).body.error).toBe("already_member");
  const n = (await b.get("/api/notifications")).body.notifications;
  expect(n[0]).toEqual(expect.objectContaining({ kind: "cluster_added", data: expect.objectContaining({ clusterName: "انتشارات" }) }));

  const col = (await b.get(url)).body.columns[0].id;
  expect((await b.post(`${url}/tasks`, { col, name: "x" })).status).toBe(403);      // members don't add tasks
  expect((await b.post(`${url}/members`, { user: c.user.id })).status).toBe(403);
  expect((await b.patch(`${url}/members/${b.user.id}`, { role: "admin" })).status).toBe(403);

  expect((await a.patch(`${url}/members/${b.user.id}`, { role: "admin" })).status).toBe(200);
  expect((await b.post(`${url}/tasks`, { col, name: "x" })).status).toBe(200);
  expect((await b.post(`${url}/members`, { user: c.user.id })).status).toBe(200);
  expect((await b.del(`${url}/members/${a.user.id}`)).status).toBe(403);           // nobody removes the owner
  expect((await b.patch(url, { name: "y" })).status).toBe(403);                     // only the owner renames
  expect((await c.del(`${url}/members/${b.user.id}`)).status).toBe(403);
  expect((await b.del(`${url}/members/${c.user.id}`)).status).toBe(200);
  expect((await a.post(`${url}/leave`)).body.error).toBe("owner_cannot_leave");
  expect((await b.post(`${url}/leave`)).status).toBe(200);
  expect((await b.get(url)).status).toBe(404);
});

test("tasks: add, edit values, move, tick steps, delete", async () => {
  const a = await signedUp(), b = await signedUp();
  const ws = await workspaceWith(a, b);
  const url = await clusterOf(a, ws);
  await a.post(`${url}/members`, { user: b.user.id });
  const [todo, doing] = (await a.get(url)).body.columns.map((k) => k.id);
  const f = async (body) => (await a.post(`${url}/fields`, body)).body.id;
  const who = await f({ name: "مسئول", type: "assign" });
  const due = await f({ name: "مهلت", type: "date" });
  const kind = await f({ name: "نوع", type: "select", opts: [{ id: "o1", name: "کتاب", color: 2 }, { id: "o2", name: "مقاله" }] });
  const steps = await f({ name: "مراحل", type: "checklist" });
  const site = await f({ name: "لینک", type: "link" });
  expect((await a.post(`${url}/fields`, { name: "x", type: "nope" })).status).toBe(400);

  const t1 = (await a.post(`${url}/tasks`, { col: todo, name: "ویرایش جلد ۲" })).body;
  expect(t1.pos).toBe(1);
  const r = await a.patch(`${url}/tasks/${t1.id}`, {
    vals: { [who]: [b.user.id, "stranger"], [due]: { d: "2026-11-02", r: "before" }, [kind]: ["o2", "o1"], [steps]: [{ t: "خواندن" }, { t: "  " }], [site]: "example.com" },
  });
  expect(r.body.vals[who]).toEqual([b.user.id]);
  expect(r.body.vals[due]).toEqual({ d: "2026-11-02", r: "before" });
  expect(r.body.vals[kind]).toEqual(["o2"]);                                        // a single select keeps one
  expect(r.body.vals[steps]).toEqual([expect.objectContaining({ t: "خواندن", d: false })]);
  expect(r.body.vals[site]).toBe("https://example.com");
  expect((await a.patch(`${url}/tasks/${t1.id}`, { vals: { [due]: "2026-02-31" } })).body.vals[due]).toBeUndefined();

  const n = (await b.get("/api/notifications")).body.notifications;
  expect(n[0]).toEqual(expect.objectContaining({ kind: "assign", data: expect.objectContaining({ taskName: "ویرایش جلد ۲", task: t1.id }) }));

  // members move tasks and tick steps, but don't edit them
  expect((await b.post(`${url}/tasks/${t1.id}/move`, { col: doing, pos: 0.5 })).status).toBe(200);
  const step = r.body.vals[steps][0].id;
  expect((await b.post(`${url}/tasks/${t1.id}/step`, { field: steps, item: step, done: true })).body.vals[steps][0].d).toBe(true);
  expect((await b.patch(`${url}/tasks/${t1.id}`, { name: "z" })).status).toBe(403);
  let c = (await a.get(url)).body;
  expect(c.tasks[0]).toEqual(expect.objectContaining({ col: doing, pos: 0.5 }));

  // deleting a field clears it from tasks; deleting a column deletes its tasks; the last column stays
  expect((await a.del(`${url}/fields/${encodeURIComponent("x\") || 1 --")}`)).status).toBe(404);   // not a field: nothing runs
  expect((await a.del(`${url}/fields/${site}`)).status).toBe(200);
  c = (await a.get(url)).body;
  expect(c.tasks[0].vals[site]).toBeUndefined();
  expect((await a.get(`/api/ws/${ws}/clusters`)).body.clusters[0].tasks).toBe(1);
  await a.del(`${url}/columns/${doing}`);
  c = (await a.get(url)).body;
  expect(c.tasks).toEqual([]);
  for (const k of c.columns.slice(1)) await a.del(`${url}/columns/${k.id}`);
  expect((await a.del(`${url}/columns/${c.columns[0].id}`)).body.error).toBe("last_column");
});

test("the version mark moves when a cluster changes, so open pages know to reload", async () => {
  const a = await signedUp(), b = await signedUp();
  const ws = await workspaceWith(a, b);
  const mark = async (p) => (await p.get(`/api/ws/${ws}/ver`)).body.clusters;
  expect(await mark(b)).toBe("");
  const url = await clusterOf(a, ws);
  const m1 = await mark(a);
  await a.post(`${url}/columns`, { name: "بازبینی" });
  expect(await mark(a)).not.toBe(m1);
  await a.post(`${url}/members`, { user: b.user.id });
  expect(await mark(b)).not.toBe("");                                               // b now sees it too
});

test("leaving the workspace leaves its clusters; an owner's clusters pass to the workspace owner", async () => {
  const a = await signedUp(), b = await signedUp(), c = await signedUp();
  const ws = await workspaceWith(a, b, c);
  const mine = await clusterOf(b, ws, "خوشه ب");
  await b.post(`${mine}/members`, { user: c.user.id });
  expect((await b.post(`/api/ws/${ws}/leave`)).status).toBe(200);
  const cl = (await a.get(mine)).body;
  expect(cl.me.role).toBe("owner");
  expect(cl.members.map((m) => m.id).sort()).toEqual([a.user.id, c.user.id].sort());
  await a.del(`/api/ws/${ws}/members/${c.user.id}`);
  expect((await a.get(mine)).body.members.map((m) => m.id)).toEqual([a.user.id]);
});

test("the owner renames and deletes; everyone keeps their own colour", async () => {
  const a = await signedUp();
  const ws = await workspaceWith(a);
  const url = await clusterOf(a, ws);
  await a.patch(`${url}/me`, { color: 5 });
  await a.patch(url, { name: "نشر" });
  expect((await a.get(`/api/ws/${ws}/clusters`)).body.clusters[0]).toEqual(expect.objectContaining({ name: "نشر", color: 5 }));
  expect((await a.del(url)).status).toBe(200);
  expect((await a.get(url)).status).toBe(404);
  // deleting the workspace takes its clusters with it
  const url2 = await clusterOf(a, ws);
  await a.del(`/api/ws/${ws}`);
  expect((await a.get(url2)).status).toBe(404);
});
