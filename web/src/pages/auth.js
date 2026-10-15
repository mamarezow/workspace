// The sign-in and sign-up card.
import { api } from "../api.js";
import { h } from "../dom.js";
import { errorText, t } from "../i18n.js";

/** @param {{ onSignedIn: () => void, note?: string }} opts */
export function authPage({ onSignedIn, note = "" }) {
  let mode = /** @type {"login" | "signup"} */ ("login");
  const root = h("div", { class: "center" });

  function render() {
    const username = h("input", { name: "username", dir: "ltr", autocomplete: "username", required: true, autocapitalize: "none" });
    const password = h("input", { name: "password", type: "password", dir: "ltr", autocomplete: mode === "login" ? "current-password" : "new-password", required: true });
    const display = h("input", { name: "display", autocomplete: "name" });
    const error = h("p", { class: "error", role: "alert" });
    const submit = h("button", { class: "btn primary", type: "submit" }, mode === "login" ? t("signIn") : t("signUp"));

    const form = h("form", {
      class: "card auth stack",
      onsubmit: async (e) => {
        e.preventDefault();
        submit.disabled = true;
        error.textContent = "";
        try {
          if (mode === "login") await api("POST", "/api/auth/login", { username: username.value, password: password.value });
          else await api("POST", "/api/auth/signup", { username: username.value, password: password.value, display: display.value, lang: document.documentElement.lang });
          onSignedIn();
        } catch (err) {
          error.textContent = errorText(err.message);
          submit.disabled = false;
        }
      },
    },
      h("h1", {}, t("appName")),
      note && h("p", { class: "muted" }, note),
      h("label", {}, t("username"), username),
      mode === "signup" && h("label", {}, t("display"), display),
      h("label", {}, t("password"), password),
      error,
      submit,
      h("button", { class: "btn quiet", type: "button", onclick: () => { mode = mode === "login" ? "signup" : "login"; render(); } },
        mode === "login" ? t("noAccount") : t("haveAccount")),
    );
    root.replaceChildren(form);
    username.focus();
  }
  render();
  return root;
}
