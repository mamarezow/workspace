// The app's entry: find out who is signed in (signing in through Telegram when opened as a mini app),
// then show the page for the current address.
import { api } from "./api.js";
import { h } from "./dom.js";
import { setLang, t } from "./i18n.js";
import { currentRoute, listen } from "./router.js";
import { errorLine } from "./ui.js";
import { authPage } from "./pages/auth.js";
import { homePage } from "./pages/home.js";
import { joinPage } from "./pages/join.js";
import { workspacePage } from "./pages/workspace.js";

const app = /** @type {HTMLElement} */ (document.getElementById("app"));

// Telegram opens the mini app with its launch data in the address; only then is Telegram's script loaded,
// so the website itself never waits on telegram.org (which is filtered in Iran outside the Telegram app).
const inTelegram = /[#&]tgWebAppData=/.test(location.hash);
function loadTelegram() {
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-web-app.js";
    s.onload = () => resolve(/** @type {any} */ (window).Telegram?.WebApp);
    s.onerror = () => resolve(null);
    document.head.append(s);
  });
}

async function currentUser() {
  try {
    return (await api("GET", "/api/me")).user;
  } catch (e) {
    if (e.status === 401) return null;
    throw e;
  }
}

async function telegramSignIn() {
  const tg = inTelegram ? await loadTelegram() : null;
  if (!tg?.initData) return false;
  tg.ready();
  try {
    await api("POST", "/api/auth/telegram", { initData: tg.initData });
    return true;
  } catch {
    return false;
  }
}

let user = null, triedTelegram = false;
let cleanups = [];

async function show() {
  for (const fn of cleanups) fn();
  cleanups = [];
  try {
    user = await currentUser();
    if (!user && !triedTelegram) {
      triedTelegram = true;
      if (await telegramSignIn()) user = await currentUser();
    }
    setLang(user?.lang || "fa");
    app.replaceChildren(await page());
  } catch (e) {
    const err = errorLine();
    err.show(e);
    app.replaceChildren(h("div", { class: "center" }, h("div", { class: "card auth stack" }, err, h("button", { class: "btn", onclick: show }, t("open")))));
  }
  app.removeAttribute("aria-busy");
  app.classList.remove("boot");
}

async function page() {
  const route = currentRoute();
  document.title = !user ? t("signIn") : route.name === "join" ? t("joinTitle") : t("myWorkspaces"); // a workspace's page puts its name here
  if (!user) return authPage({ onSignedIn: show, note: route.name === "join" ? t("signInToJoin") : "" });
  if (route.name === "workspace") return workspacePage({ id: route.id, tab: route.tab, user, onCleanup: (fn) => cleanups.push(fn) });
  if (route.name === "join") return joinPage({ code: route.code });
  return homePage({ user, onSignedOut: show, onChanged: show });
}

listen(show);
show();
