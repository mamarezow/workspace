import { test, expect } from "@playwright/test";
import { uniq } from "./helpers.mjs";

test("sign up from the page, see the profile, save it, sign out", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByRole("button", { name: "حساب ندارم" }).click();
  const username = uniq("p");
  await page.getByLabel("نام کاربری").fill(username);
  await page.getByLabel("نام نمایشی").fill("رضا");
  await page.getByLabel("رمز").fill("pass1234");
  await page.getByRole("button", { name: "ساخت حساب" }).click();

  await expect(page.getByRole("heading", { name: "ورک‌اسپیس‌های من" })).toBeVisible();
  await expect(page.getByText("@" + username)).toBeVisible();
  await page.getByLabel("درباره من").fill("برنامه‌نویس");
  await page.getByRole("button", { name: "ذخیره" }).click();
  await page.reload();
  await expect(page.getByLabel("درباره من")).toHaveValue("برنامه‌نویس");

  await page.getByRole("button", { name: "خروج" }).click();
  await expect(page.getByRole("button", { name: "ورود" })).toBeVisible();
});

test("a wrong password shows a message", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("نام کاربری").fill(uniq("x"));
  await page.getByLabel("رمز").fill("nope1234");
  await page.getByRole("button", { name: "ورود" }).click();
  await expect(page.getByRole("alert")).toHaveText("نام کاربری یا رمز درست نیست.");
});
