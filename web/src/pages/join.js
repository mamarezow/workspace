// An invite link: shows which workspace it is for, and joins it.
import { api } from "../api.js";
import { h } from "../dom.js";
import { t, tn } from "../i18n.js";
import { go } from "../router.js";
import { act, errorLine } from "../ui.js";

/** @param {{ code: string }} opts */
export async function joinPage({ code }) {
  const err = errorLine();
  let info;
  try {
    info = await api("GET", `/api/join/${encodeURIComponent(code)}`);
  } catch (e) {
    err.show(e);
    return h("div", { class: "center" }, h("div", { class: "card auth stack" }, h("h1", {}, t("joinTitle")), err,
      h("a", { class: "btn", href: "/", "data-link": true }, t("back"))));
  }
  const w = info.workspace;
  const join = h("button", { class: "btn primary" }, info.member ? t("open") : t("join"));
  join.onclick = () => act(join, err, async () => {
    if (!info.member) await api("POST", `/api/join/${encodeURIComponent(code)}`);
    go(`/w/${w.id}`, { replace: true });
  });
  return h("div", { class: "center" },
    h("div", { class: "card auth stack" },
      h("p", { class: "muted" }, t("joinTitle")),
      h("h1", {}, (w.icon ? w.icon + " " : "") + w.name),
      h("p", { class: "muted" }, info.member ? t("alreadyIn") : tn("members", info.members)),
      err,
      join,
    ));
}
