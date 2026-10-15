// The sign-in page. Always English, small letters and the thin code font, whatever the person's language,
// like the inbovo.com landing page. The person types their Telegram username, the bot messages them a code,
// they type it back. A small "password" link under it opens the username and password form.
import { api } from "../api.js";
import { h } from "../dom.js";
import { errorTextEn } from "../i18n.js";

const words = {
  tgUsername: "telegram username", sendCode: "send code", code: "code", login: "log-in", resend: "send a new code",
  sent: (bot) => `code sent. check ${bot ? "@" + bot : "the bot"} in telegram.`, startBot: (bot) => `start @${bot} first`,
  password: "password", username: "username", display: "display name", signup: "sign-up", back: "telegram",
  toJoin: "log in to join.",
};

/** @param {{ onSignedIn: () => void, joining?: boolean }} opts */
export async function authPage({ onSignedIn, joining = false }) {
  let bot = null;
  try { bot = (await api("GET", "/api/auth/telegram")).bot; } catch {}
  const card = h("div", { class: "auth" });
  const root = h("div", { class: "center night mono", dir: "ltr", lang: "en" }, h("div", { class: "brand" }, "workspace"), card);

  /** A form whose submit button is disabled while it works and whose errors show under it. */
  function form(fields, label, run) {
    const error = h("p", { class: "error", role: "alert" });
    const submit = h("button", { class: "btn primary wide", type: "submit" }, label);
    const el = h("form", {
      class: "card stack",
      onsubmit: async (e) => {
        e.preventDefault();
        submit.disabled = true;
        error.textContent = "";
        try { await run(); } catch (err) { error.textContent = errorTextEn(err.message); submit.disabled = false; }
      },
    }, joining && h("p", { class: "muted" }, words.toJoin), ...fields, error, submit);
    return { el, error };
  }

  function telegram(tgName = "") {
    const name = h("input", { name: "tg", placeholder: "@username", value: tgName, autocomplete: "username", autocapitalize: "none", spellcheck: "false", required: true });
    const f = form([h("label", {}, words.tgUsername, name)], words.sendCode, async () => {
      await api("POST", "/api/auth/telegram/code", { username: name.value });
      code(name.value);
    });
    card.replaceChildren(f.el,
      h("div", { class: "row center-row" },
        bot && h("a", { class: "btn quiet", href: `https://t.me/${encodeURIComponent(bot)}`, target: "_blank", rel: "noopener" }, words.startBot(bot)),
        h("button", { class: "btn quiet", type: "button", onclick: () => password("login") }, words.password)));
    name.focus();
  }

  function code(tgName) {
    const input = h("input", { name: "code", inputmode: "numeric", autocomplete: "one-time-code", maxlength: 6, placeholder: "······", required: true });
    const f = form([h("p", { class: "muted", role: "status" }, words.sent(bot)), h("label", {}, words.code, input)], words.login, async () => {
      await api("POST", "/api/auth/telegram/verify", { username: tgName, code: input.value });
      onSignedIn();
    });
    card.replaceChildren(f.el,
      h("div", { class: "row center-row" }, h("button", { class: "btn quiet", type: "button", onclick: () => telegram(tgName) }, words.resend)));
    input.focus();
  }

  function password(mode) {
    const username = h("input", { name: "username", autocomplete: "username", required: true, autocapitalize: "none", spellcheck: "false" });
    const pass = h("input", { name: "password", type: "password", autocomplete: mode === "login" ? "current-password" : "new-password", required: true });
    const display = h("input", { name: "display", autocomplete: "name" });
    const f = form([
      h("label", {}, words.username, username),
      mode === "signup" && h("label", {}, words.display, display),
      h("label", {}, words.password, pass),
    ], mode === "login" ? words.login : words.signup, async () => {
      if (mode === "login") await api("POST", "/api/auth/login", { username: username.value, password: pass.value });
      else await api("POST", "/api/auth/signup", { username: username.value, password: pass.value, display: display.value, lang: "fa" });
      onSignedIn();
    });
    card.replaceChildren(f.el,
      h("div", { class: "row center-row" },
        h("button", { class: "btn quiet", type: "button", onclick: () => password(mode === "login" ? "signup" : "login") }, mode === "login" ? words.signup : words.login),
        h("button", { class: "btn quiet", type: "button", onclick: () => telegram() }, words.back)));
    username.focus();
  }

  telegram();
  return root;
}
