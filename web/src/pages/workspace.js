// A workspace: its name, the three tabs, and the team tab (members, invitations, team roles, settings).
// The page asks for the workspace's version (see poll.js for how often) and redraws when someone changed something.
import { api } from "../api.js";
import { h } from "../dom.js";
import { t } from "../i18n.js";
import { go } from "../router.js";
import { act, avatar, copyText, errorLine, nameOf } from "../ui.js";
import { poller } from "../poll.js";
import { clustersTab } from "../clusters/tab.js";

const TABS = /** @type {const} */ ([["team", "tabTeam"], ["clusters", "tabClusters"], ["docs", "tabDocs"]]);

/**
 * @param {{ id: string, tab: string, sub?: string, user: any, onCleanup: (fn: () => void) => void }} opts
 */
export async function workspacePage({ id, tab, sub, user, onCleanup }) {
  const root = h("div", { class: "page stack" + (tab === "clusters" && sub ? " wide" : "") });
  let data = await api("GET", `/api/ws/${id}`);
  let clusterMark = data.clusters;
  // the clusters tab keeps itself up to date (a redraw of the page must not lose an open cluster)
  const clusters = tab === "clusters" ? await clustersTab({ wsId: id, clusterId: sub, workspace: data, user }) : null;

  const render = () => root.replaceChildren(header(data), tabs(id, tab), clusters ? clusters.el : body(data, tab, refresh));
  async function refresh() {
    data = await api("GET", `/api/ws/${id}`);
    clusters?.setWorkspace(data);
    render();
    poll?.poke();
  }

  const poll = poller(async () => {
    if (root.contains(document.activeElement) && document.activeElement.matches("input, textarea, select")) return false;   // don't redraw under someone typing
    try {
      const r = await api("GET", `/api/ws/${id}/ver`);
      let changed = false;
      if (r.ver !== data.workspace.ver) { await refresh(); changed = true; }
      if (clusters && r.clusters !== clusterMark && !clusters.busy()) {   // busy (dragging, typing, a sheet open): next time
        clusterMark = r.clusters;
        if (await clusters.reload()) changed = true;
      }
      return changed;
    } catch (e) {
      if (e.status === 404) go("/", { replace: true });                     // removed, or the workspace was deleted
      return false;
    }
  });
  onCleanup(poll.stop);

  render();
  return root;
}

function header({ workspace }) {
  document.title = workspace.name;
  return h("header", { class: "topbar" },
    h("div", { class: "row" },
      h("a", { class: "btn quiet", href: "/", "data-link": true }, "‹ " + t("back")),
      h("h1", { class: "ws-title" }, (workspace.icon ? workspace.icon + " " : "") + workspace.name)),
  );
}

function tabs(id, current) {
  return h("nav", { class: "tabs", "aria-label": "tabs" },
    ...TABS.map(([key, label]) => h("a", { href: `/w/${id}/${key}`, "data-link": true, class: "tab", "aria-current": key === current ? "page" : null }, t(label))));
}

function body(data, tab, refresh) {
  if (tab !== "team") return h("section", { class: "card" }, h("p", { class: "muted empty" }, t("comingSoon")));   // the docs tab, for now
  const admin = data.me.level !== "member";
  return h("div", { class: "stack" },
    membersCard(data, refresh),
    admin && inviteCard(data, refresh),
    rolesCard(data, refresh),
    settingsCard(data, refresh),
  );
}

/* ---------- members ---------- */

function membersCard(data, refresh) {
  const { me, roles } = data, base = `/api/ws/${data.workspace.id}`;
  const err = errorLine();
  const roleById = Object.fromEntries(roles.map((r) => [r.id, r]));

  const row = (m) => {
    const isMe = m.id === me.id, active = m.status === "active";
    const canRemove = !isMe && m.level !== "owner" && me.level !== "member" && (m.level === "member" || me.level === "owner");
    const canLevel = me.level === "owner" && active && m.level !== "owner";
    const canRoles = me.level !== "member" && active && roles.length > 0;
    const actions = [];
    if (canLevel) {
      const b = h("button", { class: "btn small" }, m.level === "admin" ? t("makeMember") : t("makeAdmin"));
      b.onclick = () => act(b, err, async () => { await api("PATCH", `${base}/members/${m.id}`, { level: m.level === "admin" ? "member" : "admin" }); await refresh(); });
      actions.push(b);
    }
    if (canRemove) {
      const b = h("button", { class: "btn small danger" }, active ? t("remove") : t("withdraw"));
      b.onclick = () => { if (confirm(nameOf(m) + " — " + t("confirmRemove"))) act(b, err, async () => { await api("DELETE", `${base}/members/${m.id}`); await refresh(); }); };
      actions.push(b);
    }
    return h("li", { class: "item member" },
      avatar(m),
      h("div", { class: "grow" },
        h("div", { class: "row" }, h("strong", {}, nameOf(m)), h("span", { class: "muted small", dir: "ltr" }, "@" + m.username)),
        m.roles.length > 0 && h("div", { class: "chips" }, ...m.roles.filter((r) => roleById[r]).map((r) => chip(roleById[r]))),
        canRoles && rolePicker(roles, m, base, err, refresh),
      ),
      h("span", { class: "badge" + (active ? "" : " quiet") }, active ? t(m.level) : t("pending")),
      actions.length > 0 && h("div", { class: "row" }, ...actions),
    );
  };
  return h("section", { class: "card stack" }, h("h2", {}, t("team")), h("ul", { class: "list" }, ...data.members.map(row)), err);
}

const chip = (r) => h("span", { class: `chip c${r.color}` }, r.name);

function rolePicker(roles, m, base, err, refresh) {
  const boxes = roles.map((r) => h("label", { class: "check" }, h("input", { type: "checkbox", value: r.id, checked: m.roles.includes(r.id) }), chip(r)));
  const save = h("button", { class: "btn small primary", type: "button" }, t("save"));
  save.onclick = () => act(save, err, async () => {
    const ids = boxes.map((b) => b.querySelector("input")).filter((i) => i.checked).map((i) => i.value);
    await api("PUT", `${base}/members/${m.id}/roles`, { roles: ids });
    await refresh();
  });
  return h("details", { class: "picker" }, h("summary", {}, t("roles")), h("div", { class: "chips" }, ...boxes), save);
}

/* ---------- invitations ---------- */

function inviteCard(data, refresh) {
  const base = `/api/ws/${data.workspace.id}`, err = errorLine();
  const username = h("input", { name: "username", dir: "ltr", autocapitalize: "none", required: true, placeholder: t("inviteUsername") });
  const send = h("button", { class: "btn primary", type: "submit" }, t("invite"));
  const byName = h("form", {
    class: "row nowrap",
    onsubmit: (e) => { e.preventDefault(); act(send, err, async () => { await api("POST", `${base}/invites`, { username: username.value }); username.value = ""; await refresh(); }); },
  }, username, send);

  const linkUrl = (code) => `${location.origin}/join/${code}`;
  const lasting = h("input", { readonly: true, dir: "ltr", "aria-label": t("lastingLink") });
  const slug = h("input", { dir: "ltr", placeholder: "our-team", "aria-label": t("linkName"), autocapitalize: "none" });
  const showLink = (l) => { lasting.value = linkUrl(l.slug || l.token); slug.value = l.slug || ""; };
  api("GET", `${base}/link`).then(showLink, (e) => err.show(e));
  const copyLasting = h("button", { class: "btn small", type: "button" }, t("copy"));
  copyLasting.onclick = () => copyText(copyLasting, lasting.value);
  const setName = h("button", { class: "btn small", type: "button" }, t("setName"));
  setName.onclick = () => act(setName, err, async () => { const r = await api("PUT", `${base}/link/slug`, { slug: slug.value }); showLink({ ...(await api("GET", `${base}/link`)), slug: r.slug }); });
  const reset = h("button", { class: "btn small", type: "button" }, t("resetLink"));
  reset.onclick = () => act(reset, err, async () => showLink(await api("POST", `${base}/link/reset`)));

  const once = h("input", { readonly: true, dir: "ltr", hidden: true, "aria-label": t("onceLink") });
  const copyOnce = h("button", { class: "btn small", type: "button", hidden: true }, t("copy"));
  copyOnce.onclick = () => copyText(copyOnce, once.value);
  const makeOnce = h("button", { class: "btn small", type: "button" }, t("makeOnce"));
  makeOnce.onclick = () => act(makeOnce, err, async () => {
    once.value = linkUrl((await api("POST", `${base}/once`)).token);
    once.hidden = copyOnce.hidden = false;
  });

  return h("section", { class: "card stack" },
    h("h2", {}, t("inviteTitle")),
    byName,
    h("h3", {}, t("lastingLink")),
    h("div", { class: "row nowrap" }, lasting, copyLasting),
    h("div", { class: "row nowrap" }, slug, setName, reset),
    h("h3", {}, t("onceLink")),
    h("div", { class: "row nowrap" }, once, copyOnce, makeOnce),
    err,
  );
}

/* ---------- team roles ---------- */

function rolesCard(data, refresh) {
  const admin = data.me.level !== "member", base = `/api/ws/${data.workspace.id}`, err = errorLine();
  const item = (r) => {
    const del = admin && h("button", { class: "btn small quiet", "aria-label": t("remove") + " " + r.name }, "✕");
    if (del) del.onclick = () => act(del, err, async () => { await api("DELETE", `${base}/roles/${r.id}`); await refresh(); });
    return h("li", { class: "row" }, chip(r), del);
  };
  let form = null;
  if (admin) {
    const name = h("input", { name: "role", maxlength: 40, required: true, placeholder: t("newRole") });
    const add = h("button", { class: "btn", type: "submit" }, t("add"));
    form = h("form", {
      class: "row nowrap",
      onsubmit: (e) => { e.preventDefault(); act(add, err, async () => { await api("POST", `${base}/roles`, { name: name.value, color: data.roles.length }); await refresh(); }); },
    }, name, add);
  }
  return h("section", { class: "card stack" },
    h("h2", {}, t("roles")),
    data.roles.length ? h("ul", { class: "chips" }, ...data.roles.map(item)) : h("p", { class: "muted" }, t("noRoles")),
    form, err);
}

/* ---------- settings ---------- */

function settingsCard(data, refresh) {
  const base = `/api/ws/${data.workspace.id}`, err = errorLine();
  if (data.me.level !== "owner") {
    const leave = h("button", { class: "btn danger" }, t("leave"));
    leave.onclick = () => { if (confirm(t("confirmLeave"))) act(leave, err, async () => { await api("POST", `${base}/leave`); go("/"); }); };
    return h("section", { class: "card stack" }, h("h2", {}, t("settings")), leave, err);
  }
  const name = h("input", { value: data.workspace.name, maxlength: 80, required: true, "aria-label": t("workspaceName") });
  const icon = h("input", { value: data.workspace.icon || "", maxlength: 8, class: "icon-input", "aria-label": t("icon") });
  const save = h("button", { class: "btn", type: "submit" }, t("rename"));
  const del = h("button", { class: "btn danger", type: "button" }, t("deleteWs"));
  del.onclick = () => { if (confirm(t("confirmDelete"))) act(del, err, async () => { await api("DELETE", base); go("/"); }); };
  return h("section", { class: "card stack" },
    h("h2", {}, t("settings")),
    h("form", {
      class: "row nowrap",
      onsubmit: (e) => { e.preventDefault(); act(save, err, async () => { await api("PATCH", base, { name: name.value, icon: icon.value }); await refresh(); }); },
    }, icon, name, save),
    del, err);
}
