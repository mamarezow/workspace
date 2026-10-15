import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, randomHex, sameText, sha256 } from "../../src/lib/crypto.js";

test("passwords hash the same way with the same salt, differently with another", async () => {
  const a = await hashPassword("secret", "salt1");
  assert.equal(a, await hashPassword("secret", "salt1"));
  assert.notEqual(a, await hashPassword("secret", "salt2"));
  assert.match(a, /^[a-f0-9]{64}$/);
});

test("random tokens have the asked length and differ", () => {
  assert.match(randomHex(32), /^[a-f0-9]{64}$/);
  assert.notEqual(randomHex(16), randomHex(16));
});

test("sha256 matches a known value", async () => {
  assert.equal(await sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("sameText compares whole strings", () => {
  assert.ok(sameText("abc", "abc"));
  assert.ok(!sameText("abc", "abd"));
  assert.ok(!sameText("abc", "ab"));
});
