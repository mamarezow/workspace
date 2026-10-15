// Pieces the clusters tab shares: a side sheet (a bottom sheet on phones), small floating menus, a colour picker and toasts.
import { h } from "../dom.js";
import { w } from "./words.js";

export const PALETTE = 8;
/** A palette colour for CSS: style="--c: var(--p3)". @param {number} i */
export const col = (i) => `var(--p${Math.abs(i || 0) % PALETTE})`;
const phoneMQ = matchMedia("(max-width: 640px)");
export const isPhone = () => phoneMQ.matches;

/* ---------- toasts ---------- */

export function toast(msg) {
  document.querySelectorAll(".cl-toast").forEach((x) => x.remove());
  const x = h("div", { class: "cl-toast", role: "status" }, msg);
  document.body.append(x);
  setTimeout(() => x.remove(), 2600);
}

/** A toast with an Undo button, instead of an "are you sure?" box. @param {string} msg @param {() => void} onUndo */
export function undoToast(msg, onUndo, ms = 5000) {
  document.querySelectorAll(".cl-toast").forEach((x) => x.remove());
  let gone = false;
  const x = h("div", { class: "cl-toast", role: "status" }, h("span", {}, msg));
  const end = () => { if (!gone) { gone = true; x.remove(); } };
  x.append(h("button", { type: "button", onclick: () => { if (!gone) { end(); onUndo(); } } }, w("undo")));
  document.body.append(x);
  setTimeout(end, ms);
}

/* ---------- floating menus ---------- */

export function closeMenus() {
  document.querySelectorAll(".cl-menu").forEach((x) => x.remove());
  document.querySelectorAll(".picking").forEach((x) => x.classList.remove("picking"));
}
document.addEventListener("click", closeMenus);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeMenus(); closeSheet(); } });

/**
 * A small menu next to `anchor`, on the page itself so no card clips it; on phones it sits at the bottom.
 * @param {HTMLElement} anchor @param {(menu: HTMLElement) => void} build
 */
export function floatMenu(anchor, build) {
  closeMenus();
  anchor.classList.add("picking");
  const menu = h("div", { class: "cl-menu", role: "menu", onclick: (e) => e.stopPropagation() });
  build(menu);
  document.body.append(menu);
  if (!isPhone()) {
    const r = anchor.getBoundingClientRect(), mw = menu.offsetWidth, rtl = document.documentElement.dir === "rtl";
    const left = Math.min(Math.max(8, rtl ? r.left : r.right - mw), innerWidth - mw - 8);
    const below = r.bottom + 6 + menu.offsetHeight < innerHeight;
    menu.style.left = left + "px";
    menu.style.top = (below ? r.bottom + 6 : Math.max(8, r.top - 6 - menu.offsetHeight)) + "px";
  }
  addEventListener("scroll", closeMenus, { once: true, capture: true });
  return menu;
}

/** Tap a colour dot: our colours to pick from. @param {HTMLElement} anchor @param {number} current @param {(i: number) => void} onPick */
export function pickColor(anchor, current, onPick) {
  if (anchor.classList.contains("picking")) return closeMenus();
  floatMenu(anchor, (m) => {
    m.classList.add("colors");
    for (let i = 0; i < PALETTE; i++) {
      m.append(h("button", {
        type: "button", class: "cdot" + (i === current ? " on" : ""), style: `--c:${col(i)}`, "aria-label": w("changeColor") + " " + (i + 1),
        onclick: () => { closeMenus(); if (i !== current) onPick(i); },
      }));
    }
  });
}

/* ---------- the sheet ---------- */

let closeOpen = null;
/** Is a sheet open? The page doesn't redraw under it. */
export const sheetOpen = () => !!closeOpen;
export const closeSheet = () => closeOpen?.();

/**
 * A panel at the side (at the bottom on phones) for details; `build` fills its body and gets a close function.
 * @param {string} title @param {(body: HTMLElement, close: () => void) => void} build @param {() => void} [onClose]
 */
export function sheet(title, build, onClose) {
  closeSheet();
  const scrim = h("div", { class: "cl-scrim" });
  const body = h("div", { class: "cl-sheet-body" });
  const panel = h("aside", { class: "cl-sheet", role: "dialog", "aria-label": title },
    h("div", { class: "cl-sheet-head" },
      h("h2", {}, title),
      h("button", { class: "btn quiet", type: "button", "aria-label": w("close"), onclick: () => close() }, "✕")),
    body);
  const close = () => {
    if (closeOpen !== close) return;
    closeOpen = null;
    scrim.remove();
    panel.remove();
    onClose?.();
  };
  scrim.onclick = close;
  closeOpen = close;
  build(body, close);
  document.body.append(scrim, panel);
  return close;
}
