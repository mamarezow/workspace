// A small router: routes are "METHOD /path/:param", handlers get (ctx, params).

/**
 * @typedef {{ req: Request, env: Env, url: URL, secure: boolean }} Ctx
 * @typedef {(ctx: Ctx, params: Record<string, string>) => Promise<Response> | Response} Handler
 */

export class Router {
  /** @type {{ method: string, re: RegExp, keys: string[], handler: Handler }[]} */
  #routes = [];

  /** @param {string} route e.g. "GET /api/users/:id" @param {Handler} handler */
  on(route, handler) {
    const [method, path] = route.split(" ");
    const keys = [];
    const re = new RegExp("^" + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "$");
    this.#routes.push({ method, re, keys, handler });
    return this;
  }

  /** @param {Ctx} ctx @returns {Promise<Response> | Response | null} */
  handle(ctx) {
    const path = ctx.url.pathname;
    for (const r of this.#routes) {
      if (r.method !== ctx.req.method) continue;
      const m = path.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      return r.handler(ctx, params);
    }
    return null;
  }
}
