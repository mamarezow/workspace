// The task sheet: its name, its status (every member may change it), and an editor for each field.
// Admins edit everything; members see the values, move the task and tick its steps.
import { h } from "../dom.js";
import { avatar, nameOf } from "../ui.js";
import { dateOf, datePicker, remindOf, showDate } from "./dates.js";
import { col, sheet, toast, undoToast } from "./kit.js";
import { fmt, w } from "./words.js";

const SAVE_AFTER_MS = 500;
const TYPE_ICON = { text: "T", number: "#", phone: "☎", link: "↗", select: "◉", assign: "☺", date: "◷", check: "✓", checklist: "☰" };
export const typeIcon = (type) => h("span", { class: "ti", "aria-hidden": "true" }, TYPE_ICON[type] || "");
const telOf = (v) => "tel:" + String(v).replace(/[^\d+]/g, "");
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
const stepId = () => Math.random().toString(36).slice(2, 10);

// deletes wait out their undo time; if the page is closed meanwhile they are sent at once
const pendingDeletes = new Map();
addEventListener("pagehide", () => {
  for (const [url, timer] of pendingDeletes) {
    clearTimeout(timer);
    fetch(url, { method: "DELETE", keepalive: true, credentials: "same-origin", headers: { "x-ws": "1" } });
  }
  pendingDeletes.clear();
});

/** @param {any} B the open cluster (see board.js) @param {string} id */
export function openTask(B, id) {
  const k = B.data.tasks.find((x) => x.id === id);
  if (!k) return;
  const ed = B.can("admin");
  const timers = {};
  // each field saves half a second after its last change
  const save = (patch, key) => {
    clearTimeout(timers[key]);
    timers[key] = setTimeout(async () => {
      try { const r = await B.send("PATCH", `/tasks/${k.id}`, patch); if (r.vals) k.vals = r.vals; } catch {}
    }, SAVE_AFTER_MS);
  };

  sheet(w("task"), (body, close) => {
    if (ed) {
      const name = h("input", { class: "tname", value: k.name, maxlength: 300, "aria-label": w("taskName") });
      name.oninput = () => { if (name.value.trim()) { k.name = name.value.trim(); save({ name: k.name }, "name"); } };
      body.append(name);
    } else {
      body.append(h("div", { class: "tname" }, k.name), h("p", { class: "muted small" }, w("memberNote")));
    }

    const statuses = h("div", { class: "opts" }, ...B.data.columns.map((c) => {
      const o = h("button", { class: "opt" + (k.col === c.id ? " on" : ""), type: "button", style: `--c:${col(c.color)}` }, h("span", { class: "dot" }), c.name);
      o.onclick = () => { B.moveToColumn(k, c.id); statuses.querySelectorAll(".opt").forEach((x) => x.classList.toggle("on", x === o)); };
      return o;
    }));
    body.append(h("div", { class: "fld" }, h("div", { class: "lbl" }, h("span", { class: "ti" }, "◎"), w("status")), statuses));

    if (!B.data.fields.length && ed) body.append(h("p", { class: "muted small" }, w("noFieldsYet")));
    for (const f of B.data.fields) body.append(fieldEditor(B, f, k, ed, save));

    if (ed) {
      const del = h("button", { class: "btn danger", type: "button" }, w("delTask"));
      del.onclick = () => {
        const at = B.data.tasks.indexOf(k), url = `${B.base}/tasks/${k.id}`;
        B.data.tasks = B.data.tasks.filter((x) => x !== k);
        close();
        const timer = setTimeout(() => { pendingDeletes.delete(url); B.send("DELETE", `/tasks/${k.id}`).catch(() => {}); }, 5000);
        pendingDeletes.set(url, timer);
        undoToast(w("deleted")(k.name), () => {
          clearTimeout(timer);
          pendingDeletes.delete(url);
          B.data.tasks.splice(Math.max(0, at), 0, k);
          B.paint();
        });
      };
      body.append(del);
    }
  }, () => B.paint());
}

/** One field of a task; `editing` opens a filled link or phone straight in its box. */
function fieldEditor(B, f, k, ed, save, editing = false) {
  const box = h("div", { class: "fld" }, h("div", { class: "lbl" }, typeIcon(f.type), f.name));
  const v = k.vals[f.id];

  if (f.type === "select" || f.type === "assign") {
    const items = f.type === "select"
      ? f.opts.map((o) => ({ id: o.id, name: o.name, color: o.color, who: null }))
      : B.data.members.map((p, i) => ({ id: p.id, name: nameOf(p), color: i, who: p }));
    const picked = new Set(Array.isArray(v) ? v : []);
    const opts = h("div", { class: "opts" });
    if (!items.length) opts.append(h("span", { class: "muted small" }, w("empty")));
    for (const it of items) {
      const o = h("button", { class: "opt" + (picked.has(it.id) ? " on" : ""), type: "button", disabled: !ed, style: `--c:${col(it.color)}` },
        it.who ? avatar(it.who, "avatar xs") : h("span", { class: "dot" }), it.name);
      o.onclick = () => {
        if (f.type === "select" && !f.multi) { const had = picked.has(it.id); picked.clear(); if (!had) picked.add(it.id); }
        else if (picked.has(it.id)) picked.delete(it.id); else picked.add(it.id);
        k.vals[f.id] = [...picked];
        opts.querySelectorAll(".opt").forEach((x, i) => x.classList.toggle("on", picked.has(items[i].id)));
        save({ vals: { [f.id]: [...picked] } }, f.id);
        if (f.type === "assign" && picked.has(it.id) && it.id !== B.data.me.id) toast(w("willBeNotified")(it.name));
      };
      opts.append(o);
    }
    box.append(opts);
    return box;
  }

  if (f.type === "checklist") return checklist(B, f, k, ed, save, box);

  if (f.type === "check") {
    const cb = h("input", { type: "checkbox", checked: v === true, disabled: !ed });
    const label = h("span", { class: "muted" }, v === true ? w("checkOn") : w("checkOff"));
    cb.onchange = () => {
      if (cb.checked) k.vals[f.id] = true; else delete k.vals[f.id];
      label.textContent = cb.checked ? w("checkOn") : w("checkOff");
      save({ vals: { [f.id]: cb.checked || null } }, f.id);
    };
    box.append(h("label", { class: "check" }, cb, label));
    return box;
  }

  if (!ed) {
    let shown = /** @type {Node | string} */ ("—");
    if (v != null && v !== "") {
      if (f.type === "link") shown = h("a", { href: v, target: "_blank", rel: "noopener noreferrer", dir: "ltr" }, v);
      else if (f.type === "phone") shown = h("a", { href: telOf(v), dir: "ltr" }, v);
      else if (f.type === "date") shown = dateOf(v) ? showDate(dateOf(v)) : "—";
      else shown = f.type === "number" ? fmt(v) : String(v);
    }
    box.append(h("div", { class: "ro" }, shown));
    return box;
  }

  if ((f.type === "link" || f.type === "phone") && v && !editing) {
    // a filled link or phone is something to use: a button, with ✎ to change it
    const use = f.type === "link"
      ? h("a", { class: "btn small", dir: "ltr", href: v, target: "_blank", rel: "noopener noreferrer" }, "↗ " + hostOf(v))
      : h("a", { class: "btn small", dir: "ltr", href: telOf(v) }, "☎ " + v);
    const change = h("button", { class: "btn small quiet", type: "button", title: w("edit"), "aria-label": w("edit") }, "✎");
    change.onclick = () => { const next = fieldEditor(B, f, k, ed, save, true); box.replaceWith(next); next.querySelector("input")?.focus(); };
    box.append(h("div", { class: "row" }, use, change));
    return box;
  }

  if (f.type === "date") {
    let day = dateOf(v), rem = v ? remindOf(v) : "before";
    const store = () => {
      const val = day ? { d: day, r: rem } : null;
      if (val) k.vals[f.id] = val; else delete k.vals[f.id];
      save({ vals: { [f.id]: val } }, f.id);
    };
    const choices = [["none", w("remNone")], ["before", w("remBefore")], ["same", w("remSame")]];
    const seg = h("div", { class: "opts" }, ...choices.map(([key, label]) => {
      const b = h("button", { class: "opt" + (key === rem ? " on" : ""), type: "button" }, label);
      b.onclick = () => { rem = key; seg.querySelectorAll(".opt").forEach((x) => x.classList.toggle("on", x === b)); if (day) store(); };
      return b;
    }));
    box.append(datePicker(day, (iso) => { day = iso; store(); }), h("div", { class: "lbl muted" }, w("remind")), seg);
    return box;
  }

  const input = f.type === "text" ? h("textarea", { rows: 3 }) : h("input", {});
  if (f.type === "number") input.setAttribute("type", "number");
  if (f.type === "phone") Object.assign(input, { type: "tel", dir: "ltr", placeholder: "0912 …" });
  if (f.type === "link") Object.assign(input, { type: "url", dir: "ltr", placeholder: "https://…" });
  input.value = v ?? "";
  input.setAttribute("aria-label", f.name);
  input.oninput = () => {
    const val = f.type === "number" ? (input.value === "" ? null : Number(input.value)) : input.value;
    if (val == null || val === "") delete k.vals[f.id]; else k.vals[f.id] = val;
    save({ vals: { [f.id]: val } }, f.id);
  };
  box.append(input);
  return box;
}

// steps: tick, rename, remove, add; the bar on the card follows
function checklist(B, f, k, ed, save, box) {
  const steps = Array.isArray(k.vals[f.id]) ? k.vals[f.id].map((x) => ({ ...x })) : [];
  const head = h("div", { class: "prog big" }), list = h("div", { class: "clist" });
  const push = () => {
    if (steps.length) k.vals[f.id] = steps.map((x) => ({ ...x })); else delete k.vals[f.id];
    save({ vals: { [f.id]: steps.length ? steps : null } }, f.id);
  };
  const draw = () => {
    const done = steps.filter((x) => x.d).length, all = steps.length;
    head.hidden = !all;
    head.classList.toggle("full", all > 0 && done === all);
    head.replaceChildren(h("div", { class: "pbar" }, h("i", { style: `width:${all ? Math.round((done / all) * 100) : 0}%` })), h("span", { class: "pnum" }, `${fmt(done)}/${fmt(all)}`));
    list.replaceChildren(...steps.map((s, i) => {
      const cb = h("input", { type: "checkbox", checked: s.d, "aria-label": s.t });
      cb.onchange = () => {
        s.d = cb.checked;
        draw();
        if (ed) return push();
        // members tick steps through their own small request
        k.vals[f.id] = steps.map((y) => ({ ...y }));
        B.send("POST", `/tasks/${k.id}/step`, { field: f.id, item: s.id, done: s.d }).then((r) => { k.vals = r.vals; }, () => {});
      };
      const row = h("div", { class: "citem" + (s.d ? " done" : "") }, cb);
      if (ed) {
        const text = h("input", { value: s.t, maxlength: 200, "aria-label": w("edit") });
        text.onchange = () => { const t = text.value.trim(); if (t) s.t = t; else steps.splice(i, 1); draw(); push(); };
        row.append(text, h("button", { class: "btn small quiet", type: "button", "aria-label": w("remove"), onclick: () => { steps.splice(i, 1); draw(); push(); } }, "✕"));
      } else row.append(h("span", {}, s.t));
      return row;
    }));
  };
  box.append(head, list);
  if (ed) {
    const add = h("input", { placeholder: w("stepPh"), maxlength: 200, enterkeyhint: "done" });
    add.onkeydown = (e) => {
      if (e.key !== "Enter" || e.isComposing) return;
      e.preventDefault();
      const t = add.value.trim();
      if (!t) return;
      steps.push({ id: stepId(), t, d: false });
      add.value = "";
      draw(); push();
    };
    box.append(add);
  }
  draw();
  return box;
}

