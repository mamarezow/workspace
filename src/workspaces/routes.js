// The workspace API: workspaces, members and their levels, team roles, invitations and invite links.
import { HttpError, json, readBody } from "../lib/http.js";
import { Router } from "../lib/router.js";
import { requireUser } from "../accounts/routes.js";
import { need } from "./access.js";
import * as ws from "./store.js";

export const workspaceRoutes = new Router()
  .on("GET /api/ws", async (ctx) => json({ workspaces: await ws.listWorkspaces(ctx.env, (await requireUser(ctx)).id) }))
  .on("POST /api/ws", async (ctx) => {
    const u = await requireUser(ctx);
    return json({ id: await ws.createWorkspace(ctx.env, u, await readBody(ctx.req)) });
  })
  .on("GET /api/ws/:id", async (ctx, p) => {
    const u = await requireUser(ctx), me = await need(ctx.env, p.id, u.id);
    return json({ ...(await ws.getWorkspace(ctx.env, p.id)), me: { id: u.id, level: me.level } });
  })
  // open pages ask this every few seconds and reload when it moves
  .on("GET /api/ws/:id/ver", async (ctx, p) => {
    await need(ctx.env, p.id, (await requireUser(ctx)).id);
    return json({ ver: await ws.workspaceVersion(ctx.env, p.id) });
  })
  .on("PATCH /api/ws/:id", async (ctx, p) => {
    await need(ctx.env, p.id, (await requireUser(ctx)).id, "owner");
    await ws.updateWorkspace(ctx.env, p.id, await readBody(ctx.req));
    return json({ ok: true });
  })
  .on("DELETE /api/ws/:id", async (ctx, p) => {
    await need(ctx.env, p.id, (await requireUser(ctx)).id, "owner");
    await ws.deleteWorkspace(ctx.env, p.id);
    return json({ ok: true });
  })
  .on("POST /api/ws/:id/leave", async (ctx, p) => {
    const u = await requireUser(ctx), me = await need(ctx.env, p.id, u.id);
    await ws.leave(ctx.env, p.id, u.id, me.level);
    return json({ ok: true });
  })

  /* ---------- members ---------- */
  .on("POST /api/ws/:id/invites", async (ctx, p) => {
    const u = await requireUser(ctx);
    await need(ctx.env, p.id, u.id, "admin");
    await ws.inviteByUsername(ctx.env, p.id, u, (await readBody(ctx.req)).username);
    return json({ ok: true });
  })
  // the invited person answers (they are not an active member yet, so no need() here)
  .on("POST /api/ws/:id/invite/accept", async (ctx, p) => {
    await ws.answerInvite(ctx.env, p.id, (await requireUser(ctx)).id, true);
    return json({ ok: true });
  })
  .on("POST /api/ws/:id/invite/decline", async (ctx, p) => {
    await ws.answerInvite(ctx.env, p.id, (await requireUser(ctx)).id, false);
    return json({ ok: true });
  })
  .on("PATCH /api/ws/:id/members/:uid", async (ctx, p) => {
    await need(ctx.env, p.id, (await requireUser(ctx)).id, "owner");
    await ws.setLevel(ctx.env, p.id, p.uid, (await readBody(ctx.req)).level);
    return json({ ok: true });
  })
  .on("DELETE /api/ws/:id/members/:uid", async (ctx, p) => {
    const u = await requireUser(ctx), me = await need(ctx.env, p.id, u.id, "admin");
    if (p.uid === u.id) throw new HttpError("use_leave");
    await ws.removeMember(ctx.env, p.id, me.level, p.uid);
    return json({ ok: true });
  })
  .on("PUT /api/ws/:id/members/:uid/roles", async (ctx, p) => {
    await need(ctx.env, p.id, (await requireUser(ctx)).id, "admin");
    await ws.setMemberRoles(ctx.env, p.id, p.uid, (await readBody(ctx.req)).roles);
    return json({ ok: true });
  })

  /* ---------- team roles ---------- */
  .on("POST /api/ws/:id/roles", async (ctx, p) => {
    await need(ctx.env, p.id, (await requireUser(ctx)).id, "admin");
    return json({ id: await ws.addRole(ctx.env, p.id, await readBody(ctx.req)) });
  })
  .on("PATCH /api/ws/:id/roles/:rid", async (ctx, p) => {
    await need(ctx.env, p.id, (await requireUser(ctx)).id, "admin");
    await ws.updateRole(ctx.env, p.id, p.rid, await readBody(ctx.req));
    return json({ ok: true });
  })
  .on("DELETE /api/ws/:id/roles/:rid", async (ctx, p) => {
    await need(ctx.env, p.id, (await requireUser(ctx)).id, "admin");
    await ws.deleteRole(ctx.env, p.id, p.rid);
    return json({ ok: true });
  })

  /* ---------- invite links ---------- */
  .on("GET /api/ws/:id/link", async (ctx, p) => {
    const u = await requireUser(ctx);
    await need(ctx.env, p.id, u.id, "admin");
    return json(await ws.lastingLink(ctx.env, p.id, u.id));
  })
  .on("POST /api/ws/:id/link/reset", async (ctx, p) => {
    const u = await requireUser(ctx);
    await need(ctx.env, p.id, u.id, "admin");
    return json(await ws.lastingLink(ctx.env, p.id, u.id, true));
  })
  .on("PUT /api/ws/:id/link/slug", async (ctx, p) => {
    const u = await requireUser(ctx);
    await need(ctx.env, p.id, u.id, "admin");
    return json({ slug: await ws.setSlug(ctx.env, p.id, u.id, (await readBody(ctx.req)).slug) });
  })
  .on("POST /api/ws/:id/once", async (ctx, p) => {
    const u = await requireUser(ctx);
    await need(ctx.env, p.id, u.id, "admin");
    return json({ token: await ws.onceLink(ctx.env, p.id, u.id) });
  })
  .on("GET /api/join/:code", async (ctx, p) => json(await ws.previewLink(ctx.env, p.code, (await requireUser(ctx)).id)))
  .on("POST /api/join/:code", async (ctx, p) => json({ id: await ws.joinByLink(ctx.env, p.code, await requireUser(ctx)) }));
