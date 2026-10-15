// After signing in: the person's profile and, soon, their workspaces.
import { api } from "../api.js";
import { h } from "../dom.js";
import { errorText, setLang, t } from "../i18n.js";

/** @param {{ user: any, onSignedOut: () => void, onChanged: () => void }} opts */
export function homePage({ user, onSignedOut, onChanged }) {
  const initial = (user.display || user.username).trim().charAt(0).toUpperCase();
  return h("div", { class: "page stack" },
    h("header", { class: "topbar" },
      h("div", { class: "row" }, h("div", { class: "avatar", "aria-hidden": "true" }, initial), h("strong", {}, user.display || user.username)),
      h("button", { class: "btn quiet", onclick: async () => { await api("POST", "/api/auth/logout"); onSignedOut(); } }, t("signOut")),
    ),
    h("section", { class: "card" },
      h("h2", {}, t("myWorkspaces")),
      h("p", { class: "muted empty" }, t("noWorkspaces")),
    ),
    profileCard(user, onChanged),
  );
}

function profileCard(user, onChanged) {
  const field = (name, label, value, attrs = {}) => h("label", {}, label, h("input", { name, value, ...attrs }));
  const pick = (name, label, value, options) =>
    h("label", {}, label, h("select", { name }, ...options.map(([v, text]) => h("option", { value: String(v), selected: String(v) === String(value) }, text))));
  const status = h("p", { class: "error", role: "status" });
  const submit = h("button", { class: "btn primary", type: "submit" }, t("save"));

  return h("form", {
    class: "card stack",
    onsubmit: async (e) => {
      e.preventDefault();
      const f = new FormData(/** @type {HTMLFormElement} */ (e.currentTarget));
      submit.disabled = true;
      try {
        const { user: next } = await api("PATCH", "/api/me", {
          display: f.get("display"), about: f.get("about"), email: f.get("email"),
          lang: f.get("lang"), cal: f.get("cal"), weekStart: Number(f.get("weekStart")),
        });
        if (next.lang !== user.lang) setLang(next.lang);
        onChanged();
      } catch (err) {
        status.textContent = errorText(err.message);
        submit.disabled = false;
      }
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
    status,
    submit,
  );
}
