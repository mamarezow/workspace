import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanValue } from "../../src/clusters/store.js";

const members = new Set(["u1", "u2"]);
const v = (type, value, more = {}) => cleanValue({ type, opts: "[]", multi: 0, ...more }, value, members);

test("each field type keeps only values that make sense for it", () => {
  assert.equal(v("text", "  hi  "), "hi");
  assert.equal(v("number", "12.5"), 12.5);
  assert.equal(v("number", "abc"), undefined);
  assert.equal(v("phone", "0912 <b>123</b>"), "0912 123");
  assert.equal(v("link", "example.com/a"), "https://example.com/a");
  assert.equal(v("check", true), true);
  assert.equal(v("check", false), undefined);
  assert.deepEqual(v("assign", ["u1", "x", "u1"]), ["u1"]);
  assert.equal(v("assign", ["x"]), undefined);
});

test("select: known options only, one unless it is multi", () => {
  const opts = JSON.stringify([{ id: "a" }, { id: "b" }]);
  assert.deepEqual(v("select", ["b", "a", "z"], { opts }), ["b"]);
  assert.deepEqual(v("select", ["b", "a", "z"], { opts, multi: 1 }), ["b", "a"]);
});

test("dates: real gregorian days, with a reminder", () => {
  assert.deepEqual(v("date", "2026-03-21"), { d: "2026-03-21", r: "none" });
  assert.deepEqual(v("date", { d: "2026-03-21", r: "same" }), { d: "2026-03-21", r: "same" });
  assert.equal(v("date", "2026-02-30"), undefined);
  assert.equal(v("date", "21/03/2026"), undefined);
});

test("checklists drop empty steps and keep at most 50", () => {
  const out = v("checklist", [{ id: "abcd", t: "one", d: 1 }, { t: "" }, ...Array.from({ length: 60 }, (_, i) => ({ t: "s" + i }))]);
  assert.equal(out.length, 49);
  assert.deepEqual(out[0], { id: "abcd", t: "one", d: true });
  assert.match(out[1].id, /^[a-f0-9]{8}$/);
});
