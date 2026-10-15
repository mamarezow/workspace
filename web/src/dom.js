// A tiny helper for building elements: h("button", { class: "btn", onclick }, "text", child).

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Record<string, any>} [attrs]
 * @param {...(Node | string | null | undefined | false)} children
 * @returns {HTMLElementTagNameMap[K]}
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children) if (c != null && c !== false) el.append(c);
  return el;
}
