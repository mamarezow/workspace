// One "person" per cookie jar, with short helpers for calling the API.
import { request } from "@playwright/test";

export const BASE = "http://127.0.0.1:8787";
let n = 0;
export const uniq = (p = "u") => `${p}${Date.now().toString(36).slice(-5)}${n++}`;

export async function person() {
  const ctx = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-ws": "1" } });
  const call = async (method, path, body) => {
    const r = await ctx.fetch(path, { method, data: body });
    let json = null;
    try { json = await r.json(); } catch {}
    return { status: r.status(), body: json, headers: r.headers() };
  };
  return {
    ctx, call,
    get: (p) => call("GET", p),
    post: (p, b = {}) => call("POST", p, b),
    patch: (p, b) => call("PATCH", p, b),
    put: (p, b) => call("PUT", p, b),
    del: (p) => call("DELETE", p),
  };
}

export async function signedUp(username = uniq(), password = "pass1234") {
  const p = await person();
  const r = await p.post("/api/auth/signup", { username, password, lang: "fa" });
  if (r.status !== 200) throw new Error("signup failed " + JSON.stringify(r.body));
  const user = (await p.get("/api/me")).body.user;
  return Object.assign(p, { username, password, user });
}
