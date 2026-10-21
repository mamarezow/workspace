// The clusters API, under /api/ws/:ws/clusters. Each route checks the workspace membership first,
// then the person's role in the cluster (see store.js for who may do what).
import { HttpError, json, readBody } from "../lib/http.js";
import { Router } from "../lib/router.js";
import { requireUser } from "../accounts/routes.js";
import { need } from "../workspaces/access.js";
import * as cl from "./store.js";

/**
 * The signed-in person, checked as a workspace member and (with a cluster id) as a cluster member of at least `role`.
 * @param {import("../lib/router.js").Ctx} ctx @param {Record<string, string>} p @param {import("./store.js").Role} [role]
 */
async function who(ctx, p, role = "member") {
  const u = await requireUser(ctx);
  await need(ctx.env, p.ws, u.id);
  const me = p.c ? await cl.needIn(ctx.env, p.ws, p.c, u.id, role) : null;
  return { u, me };
}
const ok = () => json({ ok: true });
const base = "/api/ws/:ws/clusters";

export const clusterRoutes = new Router()
  .on(`GET ${base}`, async (ctx, p) => {
    const { u } = await who(ctx, p);
    return json({ clusters: await cl.listClusters(ctx.env, p.ws, u.id) });
  })
  // any workspace member may start a cluster; they become its owner
  .on(`POST ${base}`, async (ctx, p) => {
    const { u } = await who(ctx, p);
    return json({ id: await cl.createCluster(ctx.env, p.ws, u, await readBody(ctx.req)) });
  })
  .on(`GET ${base}/:c`, async (ctx, p) => {
    const { u, me } = await who(ctx, p);
    return json({ ...(await cl.getCluster(ctx.env, p.c)), me: { id: u.id, ...me } });
  })
  .on(`PATCH ${base}/:c`, async (ctx, p) => {
    await who(ctx, p, "owner");
    await cl.renameCluster(ctx.env, p.c, (await readBody(ctx.req)).name);
    return ok();
  })
  .on(`DELETE ${base}/:c`, async (ctx, p) => {
    await who(ctx, p, "owner");
    await cl.deleteCluster(ctx.env, p.c);
    return ok();
  })
  .on(`PATCH ${base}/:c/me`, async (ctx, p) => {
    const { u } = await who(ctx, p);
    await cl.setMyColor(ctx.env, p.c, u.id, (await readBody(ctx.req)).color);
    return ok();
  })
  .on(`POST ${base}/:c/leave`, async (ctx, p) => {
    const { u, me } = await who(ctx, p);
    await cl.leaveCluster(ctx.env, p.c, u.id, me.role);
    return ok();
  })

  /* ---------- members ---------- */
  .on(`POST ${base}/:c/members`, async (ctx, p) => {
    const { u } = await who(ctx, p, "admin");
    await cl.addMember(ctx.env, p.ws, p.c, u, (await readBody(ctx.req)).user);
    return ok();
  })
  .on(`PATCH ${base}/:c/members/:uid`, async (ctx, p) => {
    await who(ctx, p, "owner");
    await cl.setRole(ctx.env, p.c, p.uid, (await readBody(ctx.req)).role);
    return ok();
  })
  .on(`DELETE ${base}/:c/members/:uid`, async (ctx, p) => {
    const { u, me } = await who(ctx, p, "admin");
    if (p.uid === u.id) throw new HttpError("use_leave");
    await cl.removeMember(ctx.env, p.c, me.role, p.uid);
    return ok();
  })

  /* ---------- columns ---------- */
  .on(`POST ${base}/:c/columns`, async (ctx, p) => {
    await who(ctx, p, "admin");
    return json({ id: await cl.addColumn(ctx.env, p.c, await readBody(ctx.req)) });
  })
  .on(`PATCH ${base}/:c/columns/:k`, async (ctx, p) => {
    await who(ctx, p, "admin");
    await cl.editColumn(ctx.env, p.c, p.k, await readBody(ctx.req));
    return ok();
  })
  .on(`DELETE ${base}/:c/columns/:k`, async (ctx, p) => {
    await who(ctx, p, "admin");
    await cl.deleteColumn(ctx.env, p.c, p.k);
    return ok();
  })

  /* ---------- fields ---------- */
  .on(`POST ${base}/:c/fields`, async (ctx, p) => {
    await who(ctx, p, "admin");
    return json({ id: await cl.addField(ctx.env, p.c, await readBody(ctx.req)) });
  })
  .on(`PATCH ${base}/:c/fields/:f`, async (ctx, p) => {
    await who(ctx, p, "admin");
    await cl.editField(ctx.env, p.c, p.f, await readBody(ctx.req));
    return ok();
  })
  .on(`DELETE ${base}/:c/fields/:f`, async (ctx, p) => {
    await who(ctx, p, "admin");
    await cl.deleteField(ctx.env, p.c, p.f);
    return ok();
  })

  /* ---------- tasks ---------- */
  .on(`POST ${base}/:c/tasks`, async (ctx, p) => {
    const { u } = await who(ctx, p, "admin");
    return json(await cl.addTask(ctx.env, p.c, u.id, await readBody(ctx.req)));
  })
  .on(`PATCH ${base}/:c/tasks/:t`, async (ctx, p) => {
    const { u } = await who(ctx, p, "admin");
    return json({ ok: true, vals: await cl.editTask(ctx.env, p.ws, p.c, p.t, u, await readBody(ctx.req)) });
  })
  .on(`DELETE ${base}/:c/tasks/:t`, async (ctx, p) => {
    await who(ctx, p, "admin");
    await cl.deleteTask(ctx.env, p.c, p.t);
    return ok();
  })
  .on(`POST ${base}/:c/tasks/:t/move`, async (ctx, p) => {
    await who(ctx, p);
    await cl.moveTask(ctx.env, p.c, p.t, await readBody(ctx.req));
    return ok();
  })
  .on(`POST ${base}/:c/tasks/:t/step`, async (ctx, p) => {
    await who(ctx, p);
    return json({ ok: true, vals: await cl.tickStep(ctx.env, p.c, p.t, await readBody(ctx.req)) });
  });
