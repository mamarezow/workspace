// Dragging task cards between and within columns: with a mouse after a few pixels, by touch after a short hold.

let dragging = false, justDropped = false;
/** True while a card is being dragged, and for a moment after it is dropped (so the drop is not also a tap). */
export const dragBusy = () => dragging || justDropped;

/** Moves elements with an animation from where they were: call `mutate` to change the DOM. */
function flip(items, mutate) {
  const first = new Map(items.map((e) => [e, e.getBoundingClientRect()]));
  mutate();
  for (const e of items) {
    if (e.classList.contains("dragging")) continue;
    const a = first.get(e), b = e.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
    if ((dx || dy) && e.animate) e.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], { duration: 200, easing: "cubic-bezier(.2,.8,.2,1)" });
  }
}

/**
 * Makes the `.task` cards in these lists draggable. Each list has data-key (its column id).
 * When a card lands somewhere new, onDrop gets { column id: [task ids in order] } and the card.
 * @param {HTMLElement[]} lists @param {HTMLElement | null} scroller the row of columns, scrolled sideways near its edges
 * @param {(order: Record<string, string[]>, card: HTMLElement) => void} onDrop
 */
export function dragCards(lists, scroller, onDrop) {
  const cardsOf = (l) => /** @type {HTMLElement[]} */ ([...l.querySelectorAll(":scope > .task")]);
  const snapshot = () => lists.map((l) => cardsOf(l).map((x) => x.dataset.id).join()).join("|");

  for (const list of lists) list.addEventListener("pointerdown", (e) => {
    if (e.button > 0) return;
    const target = /** @type {HTMLElement} */ (e.target);
    const card = /** @type {HTMLElement | null} */ (target.closest(".task"));
    if (!card || card.parentElement !== list || target.closest("button, input, textarea, select, a")) return;
    const touch = e.pointerType !== "mouse", sx = e.clientX, sy = e.clientY;
    let started = false, timer = 0, offX = 0, offY = 0, lx = sx, ly = sy, before = "", lastSide = 0;

    const follow = () => {
      card.style.transform = "none";
      const r = card.getBoundingClientRect();
      card.style.transform = `translate(${lx - offX - r.left}px,${ly - offY - r.top}px) rotate(-2deg) scale(1.03)`;
    };
    const begin = () => {
      if (started) return;
      started = dragging = true;
      before = snapshot();
      const r = card.getBoundingClientRect();
      offX = sx - r.left; offY = sy - r.top;
      card.classList.add("dragging");
      document.body.classList.add("is-dragging");
      try { navigator.vibrate?.(12); } catch {}
      follow();
    };
    if (touch) timer = setTimeout(begin, 280);
    const block = (ev) => { if (started) ev.preventDefault(); };   // no page scrolling under a dragged card

    const move = (ev) => {
      lx = ev.clientX; ly = ev.clientY;
      if (!started) {
        const d = Math.hypot(lx - sx, ly - sy);
        if (touch) { if (d > 8) cleanup(); return; }          // a finger that moves before the hold is scrolling
        if (d < 6) return;
        begin();
      }
      ev.preventDefault();
      if (ly < 70) scrollBy(0, -12); else if (ly > innerHeight - 90) scrollBy(0, 12);
      // near the side of a row of columns that scrolls sideways (one column per screen on a phone): show the next one
      if (scroller && scroller.scrollWidth > scroller.clientWidth + 2) {
        const side = lx < 28 ? -1 : lx > innerWidth - 28 ? 1 : 0, now = performance.now();
        if (side && now - lastSide > 650) { lastSide = now; scroller.scrollBy({ left: side * scroller.clientWidth, behavior: "smooth" }); }
      }
      // the list nearest the pointer, then the card it should go before
      let into = /** @type {HTMLElement} */ (card.parentElement), best = 1e9;
      for (const l of lists) {
        const r = /** @type {HTMLElement} */ (l.parentElement).getBoundingClientRect();
        const dx = lx < r.left ? r.left - lx : lx > r.right ? lx - r.right : 0, dy = ly < r.top ? r.top - ly : ly > r.bottom ? ly - r.bottom : 0;
        if (dx + dy < best && r.width) { best = dx + dy; if (best < 60) into = l; }
      }
      const others = cardsOf(into).filter((x) => x !== card);
      let next = null;
      for (const s of others) {
        const r = s.getBoundingClientRect(), tf = getComputedStyle(s).transform, shift = tf && tf !== "none" ? new DOMMatrix(tf).m42 : 0;
        if (ly < r.top + r.height / 2 - shift) { next = s; break; }
      }
      const all = lists.flatMap(cardsOf);
      if (next) { if (card.nextElementSibling !== next) flip(all, () => into.insertBefore(card, next)); }
      else {
        const last = others.at(-1);
        if (last) { if (last.nextElementSibling !== card) flip(all, () => last.after(card)); }
        else if (card.parentElement !== into) flip(all, () => { into.querySelector(".dropnote")?.remove(); into.append(card); });
      }
      follow();
    };
    const cleanup = () => {
      clearTimeout(timer);
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
      removeEventListener("touchmove", block);
    };
    const up = () => {
      cleanup();
      if (!started) return;
      dragging = false; justDropped = true;
      setTimeout(() => { justDropped = false; }, 60);
      card.classList.remove("dragging");
      document.body.classList.remove("is-dragging");
      const r0 = card.getBoundingClientRect();
      card.style.transform = "";
      const r1 = card.getBoundingClientRect();
      card.animate?.([{ transform: `translate(${r0.left - r1.left}px,${r0.top - r1.top}px)` }, { transform: "none" }], { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" });
      if (snapshot() !== before) {
        const order = Object.fromEntries(lists.map((l) => [l.dataset.key, cardsOf(l).map((x) => x.dataset.id)]));
        setTimeout(() => onDrop(order, card), 190);
      }
    };
    addEventListener("pointermove", move, { passive: false });
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    addEventListener("touchmove", block, { passive: false });
  });
}
