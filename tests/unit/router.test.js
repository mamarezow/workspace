import { test } from "node:test";
import assert from "node:assert/strict";
import { Router } from "../../src/lib/router.js";

const ctx = (method, path) => /** @type {any} */ ({ req: new Request("https://x" + path, { method }), url: new URL("https://x" + path) });

test("matches method and path, and hands over the params", async () => {
  const r = new Router().on("GET /api/ws/:id/docs/:doc", (_, p) => Response.json(p));
  const res = await r.handle(ctx("GET", "/api/ws/w1/docs/d%202"));
  assert.deepEqual(await res.json(), { id: "w1", doc: "d 2" });
});

test("returns null when nothing matches", () => {
  const r = new Router().on("GET /api/a", () => new Response());
  assert.equal(r.handle(ctx("POST", "/api/a")), null);
  assert.equal(r.handle(ctx("GET", "/api/a/b")), null);
});
