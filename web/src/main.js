// The app's entry: find out who is signed in (signing in through Telegram when opened as a mini app),
// then show the right page.
import { api } from "./api.js";
import { setLang } from "./i18n.js";
import { authPage } from "./pages/auth.js";
import { homePage } from "./pages/home.js";

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

async function show() {
  let user = await currentUser();
  if (!user && (await telegramSignIn())) user = await currentUser();
  setLang(user?.lang || "fa");
  app.removeAttribute("aria-busy");
  app.classList.remove("boot");
  app.replaceChildren(user
    ? homePage({ user, onSignedOut: show, onChanged: show })
    : authPage({ onSignedIn: show }));
}

show();
