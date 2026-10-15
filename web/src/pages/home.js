// After signing in: the person's workspaces (and invitations), a way to make one, and their profile.
import { api } from "../api.js";
import { h } from "../dom.js";
import { setLang, t, tn } from "../i18n.js";
import { go } from "../router.js";
import { act, avatar, errorLine, nameOf } from "../ui.js";

/** @param {{ user: any, onSignedOut: () => void, onChanged: () => void }} opts */
export async function homePage({ user, onSignedOut, onChanged }) {
  const { workspaces } = await api("GET", "/api/ws");
  return h("div", { class: "page stack" },
    topbar(user, onSignedOut),
    workspacesCard(workspaces, onChanged),
    profileCard(user, onChanged),
  );
}

export function topbar(user, onSignedOut) {
  return h("header", { class: "topbar" },
    h("div", { class: "row" }, avatar(user), h("strong", {}, nameOf(user))),
    h("button", { class: "btn quiet", onclick: async () => { await api("POST", "/api/auth/logout"); onSignedOut(); } }, t("signOut")),
  );
}

function workspacesCard(list, onChanged) {
  const pending = list.filter((w) => w.status === "pending"), active = list.filter((w) => w.status === "active");
  const err = errorLine();
  const invite = (w) => {
    const yes = h("button", { class: "btn primary" }, t("accept")), no = h("button", { class: "btn" }, t("decline"));
    yes.onclick = () => act(yes, err, async () => { await api("POST", `/api/ws/${w.id}/invite/accept`); go(`/w/${w.id}`); });
    no.onclick = () => act(no, err, async () => { await api("POST", `/api/ws/${w.id}/invite/decline`); onChanged(); });
    return h("li", { class: "item invite" },
      h("span", { class: "ws-icon", "aria-hidden": "true" }, w.icon || "◻"),
      h("div", { class: "grow" }, h("strong", {}, w.name), h("div", { class: "muted small" }, t("invitedYou"))),
      yes, no);
  };
  const item = (w) => h("li", {},
    h("a", { class: "item link", href: `/w/${w.id}`, "data-link": true },
      h("span", { class: "ws-icon", "aria-hidden": "true" }, w.icon || "◻"),
      h("div", { class: "grow" }, h("strong", {}, w.name), h("div", { class: "muted small" }, tn("members", w.members))),
      h("span", { class: "badge" }, t(w.level))));

  return h("section", { class: "card stack" },
    h("h2", {}, t("myWorkspaces")),
    pending.length > 0 && h("ul", { class: "list" }, ...pending.map(invite)),
    active.length ? h("ul", { class: "list" }, ...active.map(item)) : h("p", { class: "muted empty" }, t("noWorkspaces")),
    err,
    createForm(),
  );
}

function createForm() {
  const name = h("input", { name: "name", maxlength: 80, required: true, placeholder: t("workspaceName") });
  const icon = h("input", { name: "icon", maxlength: 8, placeholder: "📚", class: "icon-input", "aria-label": t("icon") });
  const err = errorLine(), submit = h("button", { class: "btn primary", type: "submit" }, t("create"));
  return h("form", {
    class: "stack",
    onsubmit: (e) => {
      e.preventDefault();
      act(submit, err, async () => {
        const { id } = await api("POST", "/api/ws", { name: name.value, icon: icon.value });
        go(`/w/${id}`);
      });
    },
  },
    h("h3", {}, t("newWorkspace")),
    h("div", { class: "row nowrap" }, icon, name, submit),
    err,
  );
}

function profileCard(user, onChanged) {
  const field = (name, label, value, attrs = {}) => h("label", {}, label, h("input", { name, value, ...attrs }));
  const pick = (name, label, value, options) =>
    h("label", {}, label, h("select", { name }, ...options.map(([v, text]) => h("option", { value: String(v), selected: String(v) === String(value) }, text))));
  const err = errorLine(), submit = h("button", { class: "btn primary", type: "submit" }, t("save"));

  return h("form", {
    class: "card stack",
    onsubmit: (e) => {
      e.preventDefault();
      const f = new FormData(/** @type {HTMLFormElement} */ (e.currentTarget));
      act(submit, err, async () => {
        const { user: next } = await api("PATCH", "/api/me", {
          display: f.get("display"), about: f.get("about"), email: f.get("email"),
          lang: f.get("lang"), cal: f.get("cal"), weekStart: Number(f.get("weekStart")),
        });
        if (next.lang !== user.lang) setLang(next.lang);
        onChanged();
      });
    },
  },
    h("h2", {}, t("profile")),
    h("p", { class: "muted", dir: "ltr" }, "@" + user.username),
    field("display", t("display"), user.display, { maxlength: 40 }),
    field("about", t("about"), user.about, { maxlength: 160 }),
    field("email", t("email"), user.email, { type: "email", dir: "ltr" }),
    pick("lang", t("lang"), user.lang, [["fa", "فارسی"], ["en", "English"]]),
    pick("cal", t("cal"), user.cal, [["shamsi", t("shamsi")], ["gregorian", t("gregorian")]]),
    pick("weekStart", t("weekStart"), user.weekStart, [[6, t("sat")], [0, t("sun")], [1, t("mon")]]),
    err,
    submit,
  );
}
