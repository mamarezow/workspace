// The clusters tab: the list of the person's clusters (with their own colour for each), or one open cluster.
// The workspace page asks for a mark of the person's clusters with its version, and calls reload() when it moved.
import { api } from "../api.js";
import { h } from "../dom.js";
import { go } from "../router.js";
import { avatar } from "../ui.js";
import { clusterBoard } from "./board.js";
import { useCalendar } from "./dates.js";
import { PALETTE, col, toast } from "./kit.js";
import { errText, w } from "./words.js";

/**
 * @param {{ wsId: string, clusterId?: string, workspace: any, user: any }} o
 * @returns {Promise<{ el: HTMLElement, reload: () => Promise<boolean>, busy: () => boolean, setWorkspace: (ws: any) => void }>}
 */
export async function clustersTab({ wsId, clusterId, workspace, user }) {
  useCalendar(user.cal);
  if (clusterId) {
    const board = await clusterBoard({ wsId, clusterId, workspace, onGone: () => go(`/w/${wsId}/clusters`, { replace: true }) })
      .catch((e) => { if (e.status !== 404) throw e; return null; });
    if (board) return { el: board.el, reload: () => board.reload(true), busy: board.busy, setWorkspace: (ws) => { board.workspace = ws; } };
    go(`/w/${wsId}/clusters`, { replace: true });     // gone, or not ours: back to the list
  }
  const el = h("section", { class: "card stack cl-list" });
  let workspaceNow = workspace, shown = "";
  const people = () => Object.fromEntries(workspaceNow.members.map((m) => [m.id, m]));

  async function load() {
    const { clusters } = await api("GET", `/api/ws/${wsId}/clusters`);
    const key = JSON.stringify(clusters);
    if (key === shown) return false;
    shown = key;
    draw(clusters);
    return true;
  }

  function draw(clusters) {
    const who = people();
    const card = (c) => {
      const swatches = h("div", { class: "swatches", title: w("yourColor") });
      for (let i = 0; i < PALETTE; i++) {
        swatches.append(h("button", {
          class: "sw" + (c.color === i ? " on" : ""), type: "button", style: `--c:${col(i)}`, "aria-label": w("yourColor") + " " + (i + 1),
          onclick: (e) => {
            e.preventDefault(); e.stopPropagation();
            c.color = i;
            link.style.setProperty("--c", col(i));
            swatches.querySelectorAll(".sw").forEach((x, j) => x.classList.toggle("on", j === i));
            api("PATCH", `/api/ws/${wsId}/clusters/${c.id}/me`, { color: i }).catch(() => {});
          },
        }));
      }
      const link = h("a", { class: "cl-card", href: `/w/${wsId}/clusters/${c.id}`, "data-link": true, style: `--c:${col(c.color)}` },
        h("div", { class: "row" }, h("span", { class: "dot" }), h("strong", { class: "grow" }, c.name), h("span", { class: "badge" }, w(c.role))),
        h("div", { class: "row" },
          h("div", { class: "avs" }, ...c.members.slice(0, 6).map((id) => who[id]).filter(Boolean).map((m) => avatar(m, "avatar xs"))),
          h("span", { class: "muted small" }, w("tasksN")(c.tasks))),
        swatches);
      return link;
    };
    el.replaceChildren(
      h("h2", {}, w("myClusters")),
      clusters.length ? h("div", { class: "cl-grid" }, ...clusters.map(card)) : h("p", { class: "muted empty" }, w("noClusters")),
      createForm());
  }

  function createForm() {
    const name = h("input", { maxlength: 80, required: true, placeholder: w("clusterName"), "aria-label": w("clusterName") });
    const make = h("button", { class: "btn primary", type: "submit" }, w("newCluster"));
    return h("form", {
      class: "row nowrap",
      onsubmit: async (e) => {
        e.preventDefault();
        make.disabled = true;
        try { const { id } = await api("POST", `/api/ws/${wsId}/clusters`, { name: name.value }); go(`/w/${wsId}/clusters/${id}`); }
        catch (x) { toast(errText(x)); }
        finally { make.disabled = false; }
      },
    }, name, make);
  }

  await load();
  return {
    el,
    reload: () => load().catch(() => false),
    busy: () => false,
    setWorkspace: (ws) => { workspaceNow = ws; },
  };
}
