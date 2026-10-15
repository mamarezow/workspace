import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyInitData } from "../../src/accounts/telegram.js";
import { signedInitData } from "../telegram-data.mjs";

const TOKEN = "123:abc", user = { id: 42, username: "sara", first_name: "Sara" };

test("accepts launch data Telegram signed", async () => {
  const r = await verifyInitData(signedInitData(TOKEN, user, { startParam: "ws1" }), TOKEN);
  assert.equal(r.user.id, 42);
  assert.equal(r.startParam, "ws1");
});

test("refuses data signed with another bot's token", async () => {
  await assert.rejects(verifyInitData(signedInitData("999:zzz", user), TOKEN), { message: "telegram_bad_data" });
});

test("refuses changed data", async () => {
  const data = signedInitData(TOKEN, user).replace("sara", "mina");
  await assert.rejects(verifyInitData(data, TOKEN), { message: "telegram_bad_data" });
});

test("refuses data older than a day", async () => {
  const old = Math.floor(Date.now() / 1000) - 2 * 86400;
  await assert.rejects(verifyInitData(signedInitData(TOKEN, user, { authDate: old }), TOKEN), { message: "telegram_expired" });
});

test("says so when the bot is not set up", async () => {
  await assert.rejects(verifyInitData("x", undefined), { message: "telegram_not_set_up" });
});
