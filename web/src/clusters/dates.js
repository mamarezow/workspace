// Dates of the "date" field: stored as gregorian YYYY-MM-DD, shown and picked in each person's own calendar.
// The shamsi <-> gregorian conversion is the jalaali algorithm (as in jalaali-js).
import { h } from "../dom.js";
import { fmt, w } from "./words.js";

let shamsi = true;
/** @param {"shamsi" | "gregorian"} cal */
export const useCalendar = (cal) => { shamsi = cal !== "gregorian"; };

const idiv = (a, b) => ~~(a / b), imod = (a, b) => a - ~~(a / b) * b;
function jalCal(jy) {
  const br = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  const gy = jy + 621;
  let leapJ = -14, jp = br[0], jump = 0;
  for (let i = 1; i < br.length; i++) {
    const jm = br[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += idiv(jump, 33) * 8 + idiv(imod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += idiv(n, 33) * 8 + idiv(imod(n, 33) + 3, 4);
  if (imod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = idiv(gy, 4) - idiv((idiv(gy, 100) + 1) * 3, 4) - 150, march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + idiv(jump + 4, 33) * 33;
  let leap = imod(imod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}
const g2d = (gy, gm, gd) =>
  idiv((gy + idiv(gm - 8, 6) + 100100) * 1461, 4) + idiv(153 * imod(gm + 9, 12) + 2, 5) + gd - 34840408 - idiv(idiv(gy + 100100 + idiv(gm - 8, 6), 100) * 3, 4) + 752;
function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j += idiv(idiv(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = idiv(imod(j, 1461), 4) * 5 + 308;
  const gd = idiv(imod(i, 153), 5) + 1, gm = imod(idiv(i, 153), 12) + 1;
  return [idiv(j, 1461) - 100100 + idiv(8 - gm, 6), gm, gd];
}
const j2d = (jy, jm, jd) => { const r = jalCal(jy); return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - idiv(jm, 7) * (jm - 7) + jd - 1; };
function d2j(jdn) {
  const gy = d2g(jdn)[0];
  let jy = gy - 621;
  const r = jalCal(jy);
  let k = jdn - g2d(gy, 3, r.march);
  if (k >= 0) {
    if (k <= 185) return [jy, 1 + idiv(k, 31), imod(k, 31) + 1];
    k -= 186;
  } else {
    jy -= 1; k += 179;
    if (r.leap === 1) k += 1;
  }
  return [jy, 7 + idiv(k, 30), imod(k, 30) + 1];
}

const isoOf = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
/** Today (or `plus` days from it) as YYYY-MM-DD, on this device's clock. */
export const isoToday = (plus = 0) => { const d = new Date(); d.setDate(d.getDate() + plus); return isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
/** A date field's value is { d, r }; older values may be a plain date. */
export const dateOf = (v) => (v && typeof v === "object" ? v.d : v) || null;
export const remindOf = (v) => (v && typeof v === "object" && v.r) || "none";

const noon = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12); };
const toCal = (iso) => { const [y, m, d] = iso.split("-").map(Number); return shamsi ? d2j(g2d(y, m, d)) : [y, m, d]; };
const fromCal = (y, m, d) => isoOf(...(shamsi ? d2g(j2d(y, m, d)) : [y, m, d]));
const monthLen = (y, m) => (shamsi ? (m <= 6 ? 31 : m <= 11 ? 30 : jalCal(y).leap === 0 ? 30 : 29) : new Date(y, m, 0).getDate());
const locale = () => (document.documentElement.lang === "en" ? "en-US" : "fa-IR") + (shamsi ? "-u-ca-persian" : "-u-ca-gregory");
const format = (d, o) => new Intl.DateTimeFormat(locale(), o).format(d);

/** A short readable date: the year only when it is not this year's. @param {string} iso */
export function showDate(iso) {
  const sameYear = toCal(iso)[0] === toCal(isoToday())[0];
  return format(noon(iso), sameYear ? { month: "long", day: "numeric" } : { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Day, month and year boxes in the person's calendar, with today, tomorrow and clear.
 * @param {string | null} value @param {(iso: string | null) => void} onChange
 */
export function datePicker(value, onChange) {
  const [cy] = toCal(isoToday());
  let [y, m, d] = value ? toCal(value) : [null, null, null];
  const sd = h("select", { "aria-label": w("day") }), sm = h("select", { "aria-label": w("month") }), sy = h("select", { "aria-label": w("year") });
  const option = (val, label, on) => h("option", { value: String(val), selected: on }, label);
  const fill = () => {
    sd.replaceChildren(option("", w("day"), !d), ...Array.from({ length: y && m ? monthLen(y, m) : 31 }, (_, i) => option(i + 1, fmt(i + 1), i + 1 === d)));
    sm.replaceChildren(option("", w("month"), !m), ...Array.from({ length: 12 }, (_, i) => option(i + 1, format(noon(fromCal(y || cy, i + 1, 1)), { month: "long" }), i + 1 === m)));
    sy.replaceChildren(option("", w("year"), !y), ...Array.from({ length: 5 }, (_, i) => option(cy - 1 + i, String(cy - 1 + i).replace(/\d/g, (c) => fmt(Number(c))), cy - 1 + i === y)));
  };
  const emit = () => { if (y && m && d) { d = Math.min(d, monthLen(y, m)); onChange(fromCal(y, m, d)); } };
  sd.onchange = () => { d = Number(sd.value) || null; if (d && !m) m = toCal(isoToday())[1]; if (d && !y) y = cy; fill(); emit(); };
  sm.onchange = () => { m = Number(sm.value) || null; if (m && !y) y = cy; if (m && !d) d = 1; fill(); emit(); };
  sy.onchange = () => { y = Number(sy.value) || null; fill(); emit(); };
  const set = (iso) => { [y, m, d] = toCal(iso); fill(); onChange(iso); };
  fill();
  return h("div", { class: "datep" },
    h("div", { class: "row nowrap" }, sd, sm, sy),
    h("div", { class: "row" },
      h("button", { class: "btn small", type: "button", onclick: () => set(isoToday()) }, w("today")),
      h("button", { class: "btn small", type: "button", onclick: () => set(isoToday(1)) }, w("tomorrow")),
      h("button", { class: "btn small quiet", type: "button", onclick: () => { y = m = d = null; fill(); onChange(null); } }, w("clearDate"))));
}
