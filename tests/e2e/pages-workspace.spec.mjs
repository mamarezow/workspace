import { test, expect } from "@playwright/test";
import { signedUp } from "./helpers.mjs";

/** a browser page signed in as p (shares the API person's cookie) */
async function pageAs(browser, p) {
  const context = await browser.newContext({ storageState: await p.ctx.storageState() });
  return context.newPage();
}

test("make a workspace, invite someone, they accept and get a team role", async ({ browser }) => {
  const a = await signedUp(), b = await signedUp();
  const pa = await pageAs(browser, a);
  await pa.goto("/");
  await pa.getByPlaceholder("اسم فضای کار").fill("تیم نشر");
  await pa.getByRole("button", { name: "ساختن" }).click();
  await expect(pa.getByRole("heading", { name: "تیم نشر" })).toBeVisible();
  await expect(pa).toHaveURL(/\/w\/w[a-f0-9]+$/);
  await expect(pa.getByRole("link", { name: "تیم و تقویم" })).toHaveAttribute("aria-current", "page");

  await pa.getByPlaceholder("نام کاربری").fill(b.username);
  await pa.getByRole("button", { name: "دعوت کن" }).click();
  await expect(pa.getByText("در انتظار پذیرش")).toBeVisible();

  await pa.getByPlaceholder("نقش تازه").fill("ویراستار");
  await pa.getByRole("button", { name: "افزودن" }).click();
  await expect(pa.locator("ul.chips .chip", { hasText: "ویراستار" })).toBeVisible();

  const pb = await pageAs(browser, b);
  await pb.goto("/");
  await expect(pb.getByText("تو را دعوت کرده‌اند")).toBeVisible();
  await pb.getByRole("button", { name: "قبول" }).click();
  await expect(pb.getByRole("heading", { name: "تیم نشر" })).toBeVisible();
  await expect(pb.getByRole("button", { name: "دعوت کن" })).toHaveCount(0);       // members don't invite

  await pa.reload();
  const row = pa.locator(".member", { hasText: "@" + b.username });
  await row.getByText("نقش‌های تیم").click();
  await row.getByRole("checkbox").check();
  await row.getByRole("button", { name: "ذخیره" }).click();
  await expect(pa.locator(".member", { hasText: "@" + b.username }).locator(".chips .chip", { hasText: "ویراستار" }).first()).toBeVisible();
});

test("join with the lasting link from the page", async ({ browser }) => {
  const a = await signedUp(), b = await signedUp();
  const { id } = (await a.post("/api/ws", { name: "کارگاه" })).body;
  const { token } = (await a.get(`/api/ws/${id}/link`)).body;
  const pb = await pageAs(browser, b);
  await pb.goto(`/join/${token}`);
  await expect(pb.getByRole("heading", { name: "کارگاه" })).toBeVisible();
  await pb.getByRole("button", { name: "ورود به فضای کار" }).click();
  await expect(pb).toHaveURL(new RegExp(`/w/${id}$`));
  await expect(pb.getByRole("link", { name: "خوشه‌ها" })).toBeVisible();
});

test("another member's change shows up without reloading", async ({ browser }) => {
  const a = await signedUp();
  const { id } = (await a.post("/api/ws", { name: "قدیمی" })).body;
  const pa = await pageAs(browser, a);
  await pa.goto(`/w/${id}`);
  await expect(pa.getByRole("heading", { name: "قدیمی" })).toBeVisible();
  await a.patch(`/api/ws/${id}`, { name: "تازه" });
  await expect(pa.getByRole("heading", { name: "تازه" })).toBeVisible({ timeout: 12_000 });
});
