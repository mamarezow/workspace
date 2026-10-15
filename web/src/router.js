// Page addresses: "/" (workspaces), "/w/:id/:tab" (a workspace), "/w/:id/clusters/:cluster" (one cluster), "/join/:code" (an invite link).
// Links with data-link change the page without reloading.

/** @typedef {{ name: "home" } | { name: "workspace", id: string, tab: string, sub?: string } | { name: "join", code: string }} Route */

/** @returns {Route} */
export function currentRoute() {
  const path = location.pathname;
  let m;
  if ((m = path.match(/^\/w\/([a-z0-9]+)\/clusters\/([a-z0-9]+)\/?$/))) return { name: "workspace", id: m[1], tab: "clusters", sub: m[2] };
  if ((m = path.match(/^\/w\/([a-z0-9]+)(?:\/(team|clusters|docs))?\/?$/))) return { name: "workspace", id: m[1], tab: m[2] || "team" };
  if ((m = path.match(/^\/join\/([A-Za-z0-9-]+)\/?$/))) return { name: "join", code: m[1] };
  return { name: "home" };
}

let onChange = () => {};

/** @param {() => void} fn */
export function listen(fn) {
  onChange = fn;
  addEventListener("popstate", () => onChange());
  document.addEventListener("click", (e) => {
    const a = /** @type {HTMLElement} */ (e.target).closest?.("a[data-link]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    go(a.getAttribute("href"));
  });
}

/** @param {string} path @param {{ replace?: boolean }} [o] */
export function go(path, o = {}) {
  if (path !== location.pathname) history[o.replace ? "replaceState" : "pushState"](null, "", path);
  onChange();
}
