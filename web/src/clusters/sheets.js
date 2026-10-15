// The cluster's sheets: statuses (columns), fields, members and settings.
import { h } from "../dom.js";
import { go } from "../router.js";
import { avatar, nameOf } from "../ui.js";
import { PALETTE, col, pickColor, sheet, toast } from "./kit.js";
import { typeIcon } from "./task.js";
import { fmt, w } from "./words.js";

const newOptId = () => "o" + Math.random().toString(36).slice(2, 9);
const nextColor = (n) => (n * 3 + 1) % PALETTE;
const FIELD_TYPES = ["text", "number", "phone", "link", "date", "check", "checklist", "select", "assign"];

/** A text box with an add button; Enter adds too. @param {string} placeholder @param {(v: string) => Promise<void> | void} onAdd */
function addRow(placeholder, onAdd, label = w("add")) {
  const input = h("input", { placeholder, maxlength: 60 });
  const btn = h("button", { class: "btn primary", type: "submit" }, label);
  return h("form", {
    class: "row nowrap",
    onsubmit: async (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return input.focus();
      btn.disabled = true;
      try { await onAdd(v); input.value = ""; } catch {} finally { btn.disabled = false; }
    },
  }, input, btn);
}

/* ---------- statuses ---------- */

export function statusesSheet(B) {
  sheet(w("editStatuses"), (body) => {
    const draw = () => {
      const d = B.data;
      body.replaceChildren(
        addRow(w("columnName"), async (name) => {
          const color = (d.columns.length * 3) % PALETTE;
          const r = await B.send("POST", "/columns", { name, color });
          d.columns.push({ id: r.id, name, color, pos: (d.columns.at(-1)?.pos || 0) + 1 });
          draw();
        }),
        ...d.columns.map((c) => {
          const n = d.tasks.filter((k) => k.col === c.id).length;
          const sw = h("button", { class: "swatch", type: "button", style: `--c:${col(c.color)}`, title: w("changeColor"), "aria-label": w("changeColor") });
          sw.onclick = (e) => {
            e.stopPropagation();
            pickColor(sw, c.color, (i) => { c.color = i; sw.style.setProperty("--c", col(i)); B.send("PATCH", `/columns/${c.id}`, { color: i }).catch(() => {}); });
          };
          const name = h("input", { value: c.name, maxlength: 60, "aria-label": w("columnName") });
          name.onchange = () => {
            const v = name.value.trim();
            if (!v || v === c.name) { name.value = c.name; return; }
            c.name = v;
            B.send("PATCH", `/columns/${c.id}`, { name: v }).catch(() => {});
          };
          const del = h("button", { class: "btn small quiet danger", type: "button", disabled: d.columns.length < 2, title: w("delColumn"), "aria-label": w("delColumn") }, "✕");
          del.onclick = async () => {
            if (!confirm(w("delColumnQ")(c.name, n))) return;
            try {
              await B.send("DELETE", `/columns/${c.id}`);
              d.columns = d.columns.filter((x) => x !== c);
              d.tasks = d.tasks.filter((k) => k.col !== c.id);
              draw();
            } catch {}
          };
          return h("div", { class: "row nowrap strow" }, sw, name, h("span", { class: "count" }, fmt(n)), del);
        }));
    };
    draw();
  }, () => B.paint());
}

/* ---------- fields ---------- */

// the options of a select: tap the dot for its colour, ✕ to remove
function optionChips(opts, onChange) {
  return h("div", { class: "opts" }, ...opts.map((o, i) => {
    const dot = h("button", { class: "dotbtn", type: "button", style: `--c:${col(o.color)}`, "aria-label": w("changeColor") });
    dot.onclick = (e) => { e.stopPropagation(); pickColor(dot, o.color, (c) => { o.color = c; onChange(opts); }); };
    return h("span", { class: "opt on", style: `--c:${col(o.color)}` }, dot, o.name,
      h("button", { class: "ox", type: "button", "aria-label": w("remove"), onclick: () => { opts.splice(i, 1); onChange(opts); } }, "✕"));
  }));
}

export function fieldsSheet(B) {
  sheet(w("fields"), (body) => {
    const list = h("div", { class: "stack" });
    const draw = () => {
      const d = B.data;
      list.replaceChildren(...(d.fields.length ? [] : [h("p", { class: "muted small" }, w("onlyName"))]), ...d.fields.flatMap((f) => {
        const kind = w("t_" + f.type) + (f.type === "select" && f.multi ? " · " + w("multi") : "");
        const del = h("button", { class: "btn small quiet danger", type: "button", "aria-label": w("remove") + " " + f.name }, "✕");
        del.onclick = async () => {
          if (!confirm(w("delFieldQ")(f.name))) return;
          try {
            await B.send("DELETE", `/fields/${f.id}`);
            d.fields = d.fields.filter((x) => x !== f);
            for (const k of d.tasks) delete k.vals[f.id];
            draw();
          } catch {}
        };
        const row = h("div", { class: "item frow" }, typeIcon(f.type), h("div", { class: "grow" }, h("strong", {}, f.name), h("div", { class: "muted small" }, kind)), del);
        if (f.type !== "select") return [row];
        const saveOpts = (opts) => { f.opts = opts; B.send("PATCH", `/fields/${f.id}`, { opts }).catch(() => {}); draw(); };
        return [row, h("div", { class: "fopts" }, optionChips(f.opts, saveOpts), addRow(w("optPh"), (v) => saveOpts([...f.opts, { id: newOptId(), name: v, color: nextColor(f.opts.length) }])))];
      }));
    };
    draw();

    // a new field: its name, its type, and for a select its options
    let type = "text", opts = [], multi = false;
    const name = h("input", { placeholder: w("fieldName"), maxlength: 60, "aria-label": w("fieldName") });
    const optsBox = h("div", { class: "stack", hidden: true });
    const chips = h("div", {});
    const drawOpts = () => chips.replaceChildren(optionChips(opts, drawOpts));
    const optInput = h("input", { placeholder: w("optPh"), maxlength: 60 });
    optInput.onkeydown = (e) => {
      if (e.key !== "Enter" || !optInput.value.trim()) return;
      e.preventDefault();
      opts.push({ id: newOptId(), name: optInput.value.trim(), color: nextColor(opts.length) });
      optInput.value = "";
      drawOpts();
    };
    const multiBox = h("input", { type: "checkbox", onchange: (e) => { multi = e.target.checked; } });
    optsBox.append(h("div", { class: "lbl" }, w("options")), chips, optInput, h("label", { class: "check" }, multiBox, w("multi")));
    const types = h("div", { class: "opts" }, ...FIELD_TYPES.map((key) => {
      const b = h("button", { class: "opt" + (key === type ? " on" : ""), type: "button" }, typeIcon(key), w("t_" + key));
      b.onclick = () => { type = key; types.querySelectorAll(".opt").forEach((x) => x.classList.toggle("on", x === b)); optsBox.hidden = key !== "select"; };
      return b;
    }));
    const add = h("button", { class: "btn primary", type: "button" }, w("add"));
    add.onclick = async () => {
      const n = name.value.trim();
      if (!n) return name.focus();
      if (type === "select" && optInput.value.trim()) { opts.push({ id: newOptId(), name: optInput.value.trim(), color: nextColor(opts.length) }); optInput.value = ""; }
      add.disabled = true;
      try {
        const r = await B.send("POST", "/fields", { name: n, type, opts, multi });
        B.data.fields.push({ id: r.id, name: n, type, opts: type === "select" ? opts : [], multi: type === "assign" || (type === "select" && multi), pos: 0 });
        name.value = ""; opts = []; drawOpts(); draw();
        toast(w("saved"));
      } catch {} finally { add.disabled = false; }
    };
    body.append(list, h("div", { class: "card stack newf" }, h("h3", {}, w("addField")), name, types, optsBox, add));
  }, () => B.paint());
}

/* ---------- members ---------- */

export function membersSheet(B) {
  sheet(w("members"), (body) => {
    const draw = () => {
      const d = B.data, meOwner = B.can("owner"), meAdmin = B.can("admin");
      const rows = d.members.map((p) => {
        const isMe = p.id === d.me.id;
        const actions = [];
        if (meOwner && p.role !== "owner") {
          const next = p.role === "member" ? "admin" : "member";
          actions.push(h("button", { class: "btn small", type: "button", onclick: async () => { try { await B.send("PATCH", `/members/${p.id}`, { role: next }); p.role = next; draw(); } catch {} } },
            p.role === "member" ? w("makeAdmin") : w("makeMember")));
        }
        if (!isMe && p.role !== "owner" && (meOwner || (meAdmin && p.role === "member"))) {
          actions.push(h("button", { class: "btn small quiet danger", type: "button", "aria-label": w("remove") + " " + nameOf(p), onclick: async () => {
            if (!confirm(w("removeQ")(nameOf(p)))) return;
            try { await B.send("DELETE", `/members/${p.id}`); d.members = d.members.filter((x) => x !== p); draw(); } catch {}
          } }, "✕"));
        }
        return h("li", { class: "item member" }, avatar(p, "avatar xs"),
          h("div", { class: "grow" }, h("strong", {}, nameOf(p)), h("div", { class: "muted small" }, h("span", { dir: "ltr" }, "@" + p.username), isMe ? " · " + w("you") : "")),
          h("span", { class: "badge" }, w(p.role)), ...actions);
      });
      body.replaceChildren(h("ul", { class: "list" }, ...rows));
      if (!meAdmin) return;
      // admins add people straight from the workspace
      const inIds = new Set(d.members.map((p) => p.id));
      const outside = B.workspace.members.filter((m) => m.status === "active" && !inIds.has(m.id));
      body.append(h("h3", {}, w("addMember")),
        outside.length
          ? h("ul", { class: "list" }, ...outside.map((m) => h("li", { class: "item member" }, avatar(m, "avatar xs"),
            h("div", { class: "grow" }, h("strong", {}, nameOf(m)), h("div", { class: "muted small", dir: "ltr" }, "@" + m.username)),
            h("button", { class: "btn small primary", type: "button", onclick: async (e) => {
              e.target.disabled = true;
              try {
                await B.send("POST", "/members", { user: m.id });
                d.members.push({ id: m.id, username: m.username, display: m.display, role: "member" });
                draw();
              } catch { e.target.disabled = false; }
            } }, w("add")))))
          : h("p", { class: "muted small" }, w("allIn")),
        h("p", { class: "muted small" }, w("addHint")));
    };
    draw();
  }, () => B.paint());
}

/* ---------- settings ---------- */

export function settingsSheet(B) {
  sheet(w("settings"), (body, close) => {
    const back = () => { close(); go(`/w/${B.wsId}/clusters`); };
    if (!B.can("owner")) {
      body.append(h("p", { class: "muted small" }, w("ownerOnly")),
        h("button", { class: "btn danger", type: "button", onclick: async () => {
          if (!confirm(w("leaveQ"))) return;
          try { await B.send("POST", "/leave"); back(); } catch {}
        } }, w("leave")));
      return;
    }
    const name = h("input", { value: B.data.cluster.name, maxlength: 80, "aria-label": w("clusterName") });
    let timer = 0;
    name.oninput = () => {
      clearTimeout(timer);
      const v = name.value.trim();
      if (!v) return;
      B.data.cluster.name = v;
      timer = setTimeout(() => B.send("PATCH", "", { name: v }).catch(() => {}), 500);
    };
    body.append(h("label", {}, w("rename"), name),
      h("button", { class: "btn danger", type: "button", onclick: async () => {
        if (!confirm(w("delClusterQ"))) return;
        try { await B.send("DELETE", ""); back(); } catch {}
      } }, w("delCluster")));
  }, () => B.paint());
}
