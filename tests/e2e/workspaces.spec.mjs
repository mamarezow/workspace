import { test, expect } from "@playwright/test";
import { person, signedUp } from "./helpers.mjs";

async function workspaceOf(owner, name = "تیم حفظ و نشر") {
  const r = await owner.post("/api/ws", { name, icon: "📚" });
  expect(r.status).toBe(200);
  return r.body.id;
}
/** owner invites p by username and p accepts */
async function addMember(owner, wsId, p) {
  expect((await owner.post(`/api/ws/${wsId}/invites`, { username: p.username })).status).toBe(200);
  expect((await p.post(`/api/ws/${wsId}/invite/accept`)).status).toBe(200);
}

test("create a workspace: the maker is its owner and the only member", async () => {
  const a = await signedUp();
  const id = await workspaceOf(a);
  const list = (await a.get("/api/ws")).body.workspaces;
  expect(list).toEqual([expect.objectContaining({ id, name: "تیم حفظ و نشر", icon: "📚", level: "owner", status: "active", members: 1 })]);
  const w = (await a.get(`/api/ws/${id}`)).body;
  expect(w.me).toEqual({ id: a.user.id, level: "owner" });
  expect(w.members).toEqual([expect.objectContaining({ id: a.user.id, level: "owner", status: "active", roles: [] })]);
  expect((await a.post("/api/ws", { name: "  " })).body.error).toBe("name_empty");
});

test("outsiders cannot see a workspace at all", async () => {
  const a = await signedUp(), b = await signedUp();
  const id = await workspaceOf(a);
  expect((await b.get(`/api/ws/${id}`)).status).toBe(404);
  expect((await b.patch(`/api/ws/${id}`, { name: "x" })).status).toBe(404);
});

test("invite by username: a notification, then accept or decline", async () => {
  const a = await signedUp(), b = await signedUp(), c = await signedUp();
  const id = await workspaceOf(a);
  expect((await a.post(`/api/ws/${id}/invites`, { username: "nobody_here" })).body.error).toBe("no_such_user");
  await a.post(`/api/ws/${id}/invites`, { username: b.username });
  expect((await a.post(`/api/ws/${id}/invites`, { username: b.username })).body.error).toBe("already_invited");

  const n = (await b.get("/api/notifications")).body.notifications;
  expect(n[0]).toMatchObject({ kind: "invite", read: false, data: { ws: id, wsName: "تیم حفظ و نشر" } });
  expect((await b.get("/api/ws")).body.workspaces[0]).toMatchObject({ id, status: "pending" });
  expect((await b.get(`/api/ws/${id}`)).status).toBe(404);          // not in until they accept

  await b.post(`/api/ws/${id}/invite/accept`);
  expect((await b.get(`/api/ws/${id}`)).body.me.level).toBe("member");
  expect((await b.get("/api/notifications")).body.notifications).toEqual([]);

  await a.post(`/api/ws/${id}/invites`, { username: c.username });
  await c.post(`/api/ws/${id}/invite/decline`);
  expect((await c.get("/api/ws")).body.workspaces).toEqual([]);
});

test("levels: members cannot invite, admins can, only the owner makes admins", async () => {
  const a = await signedUp(), b = await signedUp(), c = await signedUp(), d = await signedUp();
  const id = await workspaceOf(a);
  await addMember(a, id, b);
  await addMember(a, id, c);
  expect((await b.post(`/api/ws/${id}/invites`, { username: d.username })).status).toBe(403);
  expect((await b.patch(`/api/ws/${id}/members/${c.user.id}`, { level: "admin" })).status).toBe(403);
  expect((await a.patch(`/api/ws/${id}/members/${b.user.id}`, { level: "admin" })).status).toBe(200);
  expect((await b.post(`/api/ws/${id}/invites`, { username: d.username })).status).toBe(200);
  expect((await b.patch(`/api/ws/${id}/members/${c.user.id}`, { level: "admin" })).status).toBe(403);   // still owner only
  expect((await a.patch(`/api/ws/${id}/members/${a.user.id}`, { level: "member" })).status).toBe(403);  // the owner stays owner
});

test("removing people: admins remove members, only the owner removes admins, nobody removes the owner", async () => {
  const a = await signedUp(), b = await signedUp(), c = await signedUp(), d = await signedUp();
  const id = await workspaceOf(a);
  for (const p of [b, c, d]) await addMember(a, id, p);
  await a.patch(`/api/ws/${id}/members/${b.user.id}`, { level: "admin" });
  await a.patch(`/api/ws/${id}/members/${c.user.id}`, { level: "admin" });
  expect((await b.del(`/api/ws/${id}/members/${d.user.id}`)).status).toBe(200);
  expect((await b.del(`/api/ws/${id}/members/${c.user.id}`)).status).toBe(403);
  expect((await b.del(`/api/ws/${id}/members/${a.user.id}`)).status).toBe(403);
  expect((await a.del(`/api/ws/${id}/members/${c.user.id}`)).status).toBe(200);
  expect((await d.get(`/api/ws/${id}`)).status).toBe(404);
});

test("leaving, renaming and deleting", async () => {
  const a = await signedUp(), b = await signedUp();
  const id = await workspaceOf(a);
  await addMember(a, id, b);
  expect((await a.post(`/api/ws/${id}/leave`)).body.error).toBe("owner_cannot_leave");
  expect((await b.patch(`/api/ws/${id}`, { name: "x" })).status).toBe(403);
  await a.patch(`/api/ws/${id}`, { name: "تیم تازه" });
  expect((await b.get(`/api/ws/${id}`)).body.workspace.name).toBe("تیم تازه");
  expect((await b.post(`/api/ws/${id}/leave`)).status).toBe(200);
  expect((await b.get("/api/ws")).body.workspaces).toEqual([]);
  expect((await b.del(`/api/ws/${id}`)).status).toBe(404);
  expect((await a.del(`/api/ws/${id}`)).status).toBe(200);
  expect((await a.get(`/api/ws/${id}`)).status).toBe(404);
});

test("team roles: admins define them and give them to members", async () => {
  const a = await signedUp(), b = await signedUp();
  const id = await workspaceOf(a);
  await addMember(a, id, b);
  expect((await b.post(`/api/ws/${id}/roles`, { name: "طراح" })).status).toBe(403);
  const designer = (await a.post(`/api/ws/${id}/roles`, { name: "طراح", color: 3 })).body.id;
  const editor = (await a.post(`/api/ws/${id}/roles`, { name: "ویراستار" })).body.id;
  await a.put(`/api/ws/${id}/members/${b.user.id}/roles`, { roles: [designer, editor, "r_not_ours"] });
  let w = (await b.get(`/api/ws/${id}`)).body;
  expect(w.roles.map((r) => r.name)).toEqual(["طراح", "ویراستار"]);
  expect(w.members.find((m) => m.id === b.user.id).roles.sort()).toEqual([designer, editor].sort());

  await a.patch(`/api/ws/${id}/roles/${editor}`, { name: "ویراستار ارشد" });
  await a.del(`/api/ws/${id}/roles/${designer}`);
  w = (await b.get(`/api/ws/${id}`)).body;
  expect(w.roles).toEqual([expect.objectContaining({ id: editor, name: "ویراستار ارشد" })]);
  expect(w.members.find((m) => m.id === b.user.id).roles).toEqual([editor]);
});

test("the lasting link: join, rename it, reset it", async () => {
  const a = await signedUp(), b = await signedUp(), c = await signedUp(), d = await signedUp();
  const id = await workspaceOf(a);
  const { token } = (await a.get(`/api/ws/${id}/link`)).body;
  expect((await a.get(`/api/ws/${id}/link`)).body.token).toBe(token);      // the same link until reset

  expect((await b.get(`/api/join/${token}`)).body).toMatchObject({ workspace: { id, name: "تیم حفظ و نشر" }, members: 1, member: false });
  expect((await b.post(`/api/join/${token}`)).body.id).toBe(id);
  expect((await b.get(`/api/ws/${id}`)).body.me.level).toBe("member");

  const slug = "team-" + Date.now().toString(36);
  expect((await a.put(`/api/ws/${id}/link/slug`, { slug: "Bad Slug!" })).body.error).toBe("slug_invalid");
  expect((await a.put(`/api/ws/${id}/link/slug`, { slug })).body.slug).toBe(slug);
  expect((await c.post(`/api/join/${slug.toUpperCase()}`)).body.id).toBe(id);

  const fresh = (await a.post(`/api/ws/${id}/link/reset`)).body;
  expect(fresh.token).not.toBe(token);
  expect((await d.post(`/api/join/${token}`)).status).toBe(404);
  expect((await d.post(`/api/join/${fresh.token}`)).status).toBe(200);
});

test("a one-person link lets exactly one person in", async () => {
  const a = await signedUp(), b = await signedUp(), c = await signedUp();
  const id = await workspaceOf(a);
  const { token } = (await a.post(`/api/ws/${id}/once`)).body;
  expect((await b.post(`/api/join/${token}`)).status).toBe(200);
  expect((await c.post(`/api/join/${token}`)).body.error).toBe("link_invalid");
});

test("the version moves on every change", async () => {
  const a = await signedUp();
  const id = await workspaceOf(a);
  const v0 = (await a.get(`/api/ws/${id}/ver`)).body.ver;
  await a.post(`/api/ws/${id}/roles`, { name: "x" });
  expect((await a.get(`/api/ws/${id}/ver`)).body.ver).toBe(v0 + 1);
});

test("joining needs a signed-in person", async () => {
  const anon = await person();
  expect((await anon.post("/api/join/whatever")).status).toBe(401);
});
