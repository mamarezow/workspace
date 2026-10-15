// One cluster: its columns side by side (one at a time on a phone), task cards you drag or move with a menu,
// adding a task in place, the "only mine" filter, and the doors to the task, statuses, fields, members and settings sheets.
import { api } from "../api.js";
import { h } from "../dom.js";
import { avatar } from "../ui.js";
import { dateOf, isoToday, remindOf, showDate } from "./dates.js";
import { dragBusy, dragCards } from "./drag.js";
import { closeMenus, col, floatMenu, isPhone, sheetOpen, toast } from "./kit.js";
import { fieldsSheet, membersSheet, settingsSheet, statusesSheet } from "./sheets.js";
import { openTask } from "./task.js";
import { errText, fmt, w } from "./words.js";

const RANK = { member: 1, admin: 2, owner: 3 };
const MOVE_ICON = "⇄";

/**
 * @typedef {{ id: string, col: string, name: string, pos: number, vals: Record<string, any>, pending?: boolean }} Task
 * @typedef {{ id: string, name: string, type: string, opts: { id: string, name: string, color: number }[], multi: boolean }} Field
 * @typedef {{
 *   cluster: { id: string, name: string, ver: number },
 *   me: { id: string, role: "owner" | "admin" | "member", color: number },
 *   members: { id: string, username: string, display?: string, role: string }[],
 *   columns: { id: string, name: string, color: number, pos: number }[],
 *   fields: Field[], tasks: Task[],
 * }} ClusterData
 */

/**
 * @param {{ wsId: string, clusterId: string, workspace: any, onGone: () => void }} o
 */
export async function clusterBoard({ wsId, clusterId, workspace, onGone }) {
  const base = `/api/ws/${wsId}/clusters/${clusterId}`;
  const el = h("div", { class: "cl-board" });
  const mineKey = "ws-mine-" + clusterId;
  let onlyMine = false;
  try { onlyMine = localStorage.getItem(mineKey) === "1"; } catch {}
  let typing = 0;            // >0 while a task is being typed in place; the page doesn't redraw under it
  let phoneCol = 0;          // the column shown on a phone

  const B = {
    base, wsId, workspace,
    /** @type {ClusterData} */ data: await api("GET", base),
    /** @param {"member" | "admin" | "owner"} role */
    can: (role) => RANK[B.data.me.role] >= RANK[role],
    member: (id) => B.data.members.find((p) => p.id === id),
    paint,
    /** Sends a change; on failure says why and reloads, so the page shows what really happened. */
    send: async (method, path, body) => {
      try { return await api(method, base + path, body); }
      catch (e) { toast(errText(e)); await B.reload(true); throw e; }
    },
    /** Reloads from the server; returns whether anything changed. @param {boolean} [force] */
    reload: async (force) => {
      if (!force && B.busy()) return false;
      try {
        const fresh = await api("GET", base);
        if (JSON.stringify(fresh) === JSON.stringify(B.data)) return false;
        B.data = fresh;
        if (!sheetOpen()) paint();
        return true;
      } catch (e) {
        if (e.status === 404) onGone();
        return false;
      }
    },
    busy: () => typing > 0 || dragBusy() || sheetOpen(),
    moveTask, moveToColumn,
    gone: onGone,
  };

  /** Puts a task in a column between two neighbours' positions, then tells the server. */
  function moveTask(k, colId, prevPos, nextPos) {
    const pos = prevPos == null && nextPos == null ? 1 : prevPos == null ? nextPos - 1 : nextPos == null ? prevPos + 1 : (prevPos + nextPos) / 2;
    k.col = colId; k.pos = pos;
    B.data.tasks.sort((a, b) => a.pos - b.pos);
    paint();
    B.send("POST", `/tasks/${k.id}/move`, { col: colId, pos }).catch(() => {});
  }
  function moveToColumn(k, colId) {
    if (k.col === colId) return;
    const last = B.data.tasks.filter((x) => x.col === colId).at(-1);
    moveTask(k, colId, last ? last.pos : null, null);
    toast(w("movedTo")(B.data.columns.find((c) => c.id === colId)?.name || ""));
  }

  function paint() {
    closeMenus();
    const d = B.data, phone = isPhone();
    const assignFields = d.fields.filter((f) => f.type === "assign");
    const isMine = (k) => assignFields.some((f) => Array.isArray(k.vals[f.id]) && k.vals[f.id].includes(d.me.id));
    const shown = (k) => !onlyMine || !assignFields.length || isMine(k);
    const lastCol = d.columns.at(-1)?.id;
    phoneCol = Math.min(phoneCol, d.columns.length - 1);
    el.style.setProperty("--c", col(d.me.color));

    // the head: back, name, members, and the doors to the sheets
    const head = h("div", { class: "cl-head" },
      h("a", { class: "btn quiet", href: `/w/${wsId}/clusters`, "data-link": true }, "‹ " + w("clusters")),
      h("h2", { class: "cl-name" }, h("span", { class: "dot" }), d.cluster.name),
      h("span", { class: "grow" }),
      h("div", { class: "avs" }, ...d.members.slice(0, 6).map((p) => avatar(p, "avatar xs"))),
      h("button", { class: "btn small", type: "button", onclick: () => membersSheet(B) }, w("members")),
      B.can("admin") && h("button", { class: "btn small", type: "button", onclick: () => fieldsSheet(B) }, w("fields")),
      h("button", { class: "btn small", type: "button", "aria-label": w("settings"), title: w("settings"), onclick: () => settingsSheet(B) }, "⋯"));

    const tools = h("div", { class: "row cl-tools" },
      B.can("admin") && h("button", { class: "btn small", type: "button", onclick: () => statusesSheet(B) }, "✎ " + w("editStatuses")),
      assignFields.length > 0 && h("button", {
        class: "btn small" + (onlyMine ? " on" : ""), type: "button", "aria-pressed": onlyMine ? "true" : "false",
        onclick: () => { onlyMine = !onlyMine; try { localStorage.setItem(mineKey, onlyMine ? "1" : ""); } catch {} paint(); },
      }, (onlyMine ? "✓ " : "") + w("onlyMine")));

    const cols = h("div", { class: "cl-cols" + (phone ? " one" : "") });
    const lists = [];
    // on a phone: one column per screen, picked from a row of tabs or swiped sideways
    const tabs = phone ? h("div", { class: "cl-coltabs", role: "tablist" }) : null;
    d.columns.forEach((c, i) => {
      const tasks = d.tasks.filter((k) => k.col === c.id && shown(k));
      const count = h("span", { class: "count" }, fmt(tasks.length));
      const name = h("span", { class: "name" }, c.name);
      if (B.can("admin")) {
        name.title = w("rename");
        name.onclick = () => renameInPlace(name, c);
      }
      const list = h("div", { class: "cards", "data-key": c.id }, ...tasks.map((k) => taskCard(k, c.id === lastCol)));
      if (!tasks.length) list.append(h("div", { class: "dropnote" }, w("emptyColumn")));
      lists.push(list);
      const column = h("section", { class: "cl-col", style: `--c:${col(c.color)}`, "aria-label": c.name },
        h("div", { class: "colh" }, h("span", { class: "dot" }), name, count),
        list,
        B.can("admin") && addTaskButton(c, list, count));
      cols.append(column);
      tabs?.append(h("button", {
        class: "chip-tab" + (i === phoneCol ? " on" : ""), type: "button", role: "tab", style: `--c:${col(c.color)}`,
        onclick: () => cols.children[i]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" }),
      }, h("span", { class: "dot" }), c.name, " ", h("span", { class: "count" }, fmt(tasks.length))));
    });

    el.replaceChildren(...[head, tabs, tools.childNodes.length ? tools : null, cols].filter(Boolean));
    if (phone) {
      // keep showing the same column after a redraw, and follow the swipes
      requestAnimationFrame(() => { cols.scrollLeft = (document.documentElement.dir === "rtl" ? -1 : 1) * phoneCol * cols.clientWidth; });
      cols.addEventListener("scroll", () => {
        const i = Math.round(Math.abs(cols.scrollLeft) / Math.max(1, cols.clientWidth));
        if (i === phoneCol) return;
        phoneCol = i;
        tabs.querySelectorAll(".chip-tab").forEach((b, j) => b.classList.toggle("on", j === i));
        tabs.children[i]?.scrollIntoView({ block: "nearest", inline: "nearest" });
      }, { passive: true });
    }

    dragCards(lists, phone ? cols : null, (order, card) => {
      const id = card.dataset.id, k = d.tasks.find((x) => x.id === id);
      if (!k) return;
      const colId = Object.keys(order).find((c) => order[c].includes(id)), ids = order[colId], at = ids.indexOf(id);
      const pos = (tid) => d.tasks.find((x) => x.id === tid)?.pos;
      moveTask(k, colId, at > 0 ? pos(ids[at - 1]) : null, at < ids.length - 1 ? pos(ids[at + 1]) : null);
    });
  }

  function renameInPlace(name, c) {
    const input = h("input", { class: "inline", value: c.name, maxlength: 60, "aria-label": w("rename") });
    name.replaceWith(input);
    input.focus(); input.select();
    typing++;
    let done = false;
    const finish = (keep) => {
      if (done) return;
      done = true; typing--;
      const v = input.value.trim();
      if (keep && v && v !== c.name) { c.name = v; B.send("PATCH", `/columns/${c.id}`, { name: v }).catch(() => {}); }
      paint();
    };
    input.onblur = () => finish(true);
    input.onkeydown = (e) => { if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); };
  }

  // a new task is typed in place under its column; it shows at once and gets its real id a moment later
  function addTaskButton(c, list, count) {
    const btn = h("button", { class: "cl-add", type: "button" }, w("newTask"));
    btn.onclick = () => {
      const input = h("input", { class: "inline", placeholder: w("taskPh"), maxlength: 300, enterkeyhint: "done", "aria-label": w("taskName") });
      btn.replaceWith(input);
      input.focus();
      typing++;
      let closed = false;
      const add = () => {
        const v = input.value.trim();
        if (!v) return;
        input.value = "";
        const k = /** @type {Task} */ ({ id: "tmp" + Date.now(), col: c.id, name: v, pos: Math.max(0, ...B.data.tasks.filter((x) => x.col === c.id).map((x) => x.pos)) + 1, vals: {}, pending: true });
        B.data.tasks.push(k);
        list.querySelector(".dropnote")?.remove();
        list.append(taskCard(k, c.id === B.data.columns.at(-1)?.id));
        count.textContent = fmt(B.data.tasks.filter((x) => x.col === c.id).length);
        typing++;
        api("POST", base + "/tasks", { col: c.id, name: v })
          .then((r) => { k.id = r.id; k.pos = r.pos; delete k.pending; })
          .catch((e) => { B.data.tasks = B.data.tasks.filter((x) => x !== k); toast(errText(e)); })
          .finally(() => { typing--; if (!closed) return; paint(); });
      };
      const close = (keep) => {
        if (closed) return;
        closed = true; typing--;
        if (keep) add();
        if (!B.data.tasks.some((x) => x.pending)) paint();
      };
      input.onkeydown = (e) => {
        if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); add(); }     // stays open for the next one
        if (e.key === "Escape") close(false);
      };
      input.onblur = () => close(true);
    };
    return btn;
  }

  /* ---------- a task card ---------- */

  function taskCard(k, inLastColumn) {
    const d = B.data;
    const card = h("div", {
      class: "task" + (inLastColumn ? " fin" : "") + (k.pending ? " pending" : ""), "data-id": k.id, tabindex: "0",
      style: `--c:${col(d.columns.find((x) => x.id === k.col)?.color)}`,
    }, h("div", { class: "body" }, h("div", { class: "tn" }, k.name), valuePills(k, inLastColumn), progress(k)));
    const mv = h("button", { class: "mv", type: "button", title: w("move"), "aria-label": w("move") }, MOVE_ICON);
    mv.onclick = (e) => {
      e.stopPropagation();
      floatMenu(mv, (menu) => {
        for (const c of d.columns.filter((x) => x.id !== k.col)) {
          menu.append(h("button", { class: "mi", type: "button", style: `--c:${col(c.color)}`, onclick: () => { closeMenus(); moveToColumn(k, c.id); } }, h("span", { class: "dot" }), c.name));
        }
        if (B.can("admin")) menu.append(h("button", { class: "mi", type: "button", onclick: () => { closeMenus(); statusesSheet(B); } }, "✎ " + w("editStatuses")));
      });
    };
    card.append(mv);
    const open = () => { if (!dragBusy() && !k.pending) openTask(B, k.id); };
    card.onclick = (e) => { if (!/** @type {HTMLElement} */ (e.target).closest(".mv, a")) open(); };
    card.onkeydown = (e) => { if (e.key === "Enter" && e.target === card) open(); };
    return card;
  }

  function valuePills(k, inLastColumn) {
    const box = h("div", { class: "vals" });
    for (const f of B.data.fields) {
      const v = k.vals[f.id];
      if (v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
      if (f.type === "select") {
        for (const id of v) { const o = f.opts.find((x) => x.id === id); if (o) box.append(h("span", { class: "pill", style: `--c:${col(o.color)}` }, o.name)); }
      } else if (f.type === "assign") {
        box.append(h("span", { class: "avs" }, ...v.map((id) => B.member(id)).filter(Boolean).map((p) => avatar(p, "avatar xs"))));
      } else if (f.type === "number") box.append(h("span", { class: "pill plain" }, fmt(v)));
      else if (f.type === "phone") box.append(h("a", { class: "pill plain", dir: "ltr", href: "tel:" + String(v).replace(/[^\d+]/g, "") }, "☎ " + v));
      else if (f.type === "link") box.append(h("a", { class: "pill plain", dir: "ltr", href: v, target: "_blank", rel: "noopener noreferrer" }, "↗ " + hostOf(v)));
      else if (f.type === "check") box.append(h("span", { class: "pill plain" }, "✓ " + f.name));
      else if (f.type === "date") {
        // past due (unless it reached the last status) is red, today is marked too
        const day = dateOf(v);
        if (!day) continue;
        const today = isoToday(), when = inLastColumn ? "" : day < today ? " late" : day === today ? " now" : "";
        box.append(h("span", { class: "pill plain date" + when }, "◷ " + showDate(day) + (remindOf(v) !== "none" ? " 🔔" : "")));
      } else if (f.type === "text") box.append(h("span", { class: "pill plain" }, String(v).slice(0, 40)));
    }
    return box.childNodes.length ? box : null;
  }

  // all checklist steps of a task together, as a thin bar
  function progress(k) {
    let done = 0, all = 0;
    for (const f of B.data.fields) if (f.type === "checklist" && Array.isArray(k.vals[f.id])) for (const s of k.vals[f.id]) { all++; if (s.d) done++; }
    if (!all) return null;
    return h("div", { class: "prog" + (done === all ? " full" : ""), title: `${done}/${all}` },
      h("div", { class: "pbar" }, h("i", { style: `width:${Math.round((done / all) * 100)}%` })),
      h("span", { class: "pnum" }, `${fmt(done)}/${fmt(all)}`));
  }

  paint();
  return Object.assign(B, { el });
}

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
