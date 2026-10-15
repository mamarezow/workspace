// Asking the server "did anything change?" without wasting requests (Workers' free plan allows 100k a day).
// It asks every few seconds right after something changed, slows down to once a minute while nothing does,
// stops while the tab is hidden, and asks once as soon as the tab is shown again.

const FAST_MS = 5_000, SLOW_MS = 60_000, GROWTH = 1.5;

/**
 * @param {() => Promise<boolean>} check resolves true when something changed
 * @returns {{ stop: () => void, poke: () => void }} poke() = something just changed here, go fast again
 */
export function poller(check) {
  let delay = FAST_MS, timer = 0, stopped = false;
  const schedule = () => {
    clearTimeout(timer);
    if (!stopped && !document.hidden) timer = setTimeout(tick, delay);
  };
  async function tick() {
    let changed = false;
    try { changed = await check(); } catch {}
    delay = changed ? FAST_MS : Math.min(SLOW_MS, delay * GROWTH);
    schedule();
  }
  const onVisible = () => {
    if (document.hidden) return clearTimeout(timer);
    delay = FAST_MS;
    tick();
  };
  document.addEventListener("visibilitychange", onVisible);
  schedule();
  return {
    stop: () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); },
    poke: () => { delay = FAST_MS; schedule(); },
  };
}
