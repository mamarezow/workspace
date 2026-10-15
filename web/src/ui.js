// Small shared pieces of the pages.
import { h } from "./dom.js";
import { errorText, t } from "./i18n.js";

/** The person's first letter in a circle. @param {{ display?: string, username: string }} u */
export const avatar = (u, cls = "avatar") => h("div", { class: cls, "aria-hidden": "true" }, (u.display || u.username).trim().charAt(0).toUpperCase());

/** A name to show: the display name, or @username. */
export const nameOf = (u) => u.display || "@" + u.username;

/** A line for errors under a form; show(err) or clear(). */
export function errorLine() {
  const el = h("p", { class: "error", role: "alert" });
  return Object.assign(el, {
    show: (err) => { el.textContent = errorText(err?.message || String(err)); },
    clear: () => { el.textContent = ""; },
  });
}

/**
 * Runs an action from a button: the button is disabled meanwhile, errors go to the error line.
 * @param {HTMLButtonElement} btn @param {ReturnType<typeof errorLine>} err @param {() => Promise<void>} fn
 */
export async function act(btn, err, fn) {
  btn.disabled = true;
  err.clear();
  try { await fn(); } catch (e) { err.show(e); } finally { btn.disabled = false; }
}

/** Copies text, saying so on the button for a moment. @param {HTMLButtonElement} btn @param {string} text */
export async function copyText(btn, text) {
  try { await navigator.clipboard.writeText(text); } catch { return; }
  const was = btn.textContent;
  btn.textContent = t("copied");
  setTimeout(() => { btn.textContent = was; }, 1500);
}
