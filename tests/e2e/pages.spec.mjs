import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import { BASE, uniq } from "./helpers.mjs";
import { BOT_TOKEN, TELEGRAM_API } from "../../playwright.config.mjs";

test("sign up from the page, see the profile, save it, sign out", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByRole("button", { name: "password" }).click();
  await page.getByRole("button", { name: "sign-up" }).click();
  const username = uniq("p");
  await page.getByLabel("username").fill(username);
  await page.getByLabel("display name").fill("رضا");
  await page.getByLabel("password").fill("pass1234");
  await page.getByRole("button", { name: "sign-up" }).click();

  await expect(page.getByRole("heading", { name: "فضاهای کار من" })).toBeVisible();
  await expect(page.getByText("@" + username)).toBeVisible();
  await page.getByLabel("درباره من").fill("برنامه‌نویس");
  await page.getByRole("button", { name: "ذخیره" }).click();
  await page.reload();
  await expect(page.getByLabel("درباره من")).toHaveValue("برنامه‌نویس");

  await page.getByRole("button", { name: "خروج" }).click();
  await expect(page.getByRole("button", { name: "send code" })).toBeVisible();
});

test("a wrong password shows a message", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "password" }).click();
  await page.getByLabel("username").fill(uniq("x"));
  await page.getByLabel("password").fill("nope1234");
  await page.getByRole("button", { name: "log-in" }).click();
  await expect(page.getByRole("alert")).toHaveText("Wrong username or password.");
});

test("log in with a code from the bot", async ({ page }) => {
  const tg = { id: Math.floor(Math.random() * 1e9), username: uniq("Tg"), first_name: "Sara" };
  const secret = crypto.createHmac("sha256", BOT_TOKEN).update("webhook").digest("hex").slice(0, 48);
  await fetch(BASE + "/api/telegram/webhook", {     // they started the bot
    method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify({ message: { text: "/start", from: tg, chat: { id: tg.id, type: "private" } } }),
  });
  await page.goto("/");
  await expect(page.getByLabel("username", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "start @inbovoBot first" })).toHaveAttribute("href", "https://t.me/inbovoBot");
  await page.getByLabel("telegram username").fill("@" + tg.username);
  await page.getByRole("button", { name: "send code" }).click();
  await expect(page.getByRole("status")).toHaveText("code sent. check @inbovoBot in telegram.");
  const sent = await (await fetch(TELEGRAM_API + "/sent")).json();
  const code = sent.filter((m) => m.body?.chat_id === tg.id).pop().body.text.match(/\d{6}/)[0];
  await page.getByLabel("code").fill(code);
  await page.getByRole("button", { name: "log-in" }).click();
  await expect(page.getByRole("heading", { name: "فضاهای کار من" })).toBeVisible();
});
