import { test, expect } from "@playwright/test";
import { signedUp } from "./helpers.mjs";

async function pageAs(browser, p, viewport) {
  const context = await browser.newContext({ storageState: await p.ctx.storageState(), ...(viewport ? { viewport } : {}) });
  return context.newPage();
}
async function workspaceWith(owner, ...others) {
  const id = (await owner.post("/api/ws", { name: "تیم" })).body.id;
  for (const p of others) {
    await owner.post(`/api/ws/${id}/invites`, { username: p.username });
    await p.post(`/api/ws/${id}/invite/accept`);
  }
  return id;
}

test("make a cluster, add a task, give it a field value, and move it", async ({ browser }) => {
  const a = await signedUp();
  const ws = await workspaceWith(a);
  const pa = await pageAs(browser, a);
  await pa.goto(`/w/${ws}/clusters`);
  await expect(pa.getByText("هنوز در هیچ خوشه‌ای نیستی")).toBeVisible();
  await pa.getByPlaceholder("اسم خوشه").fill("انتشارات");
  await pa.getByRole("button", { name: "خوشه جدید" }).click();
  await expect(pa.getByRole("heading", { name: "انتشارات" })).toBeVisible();
  await expect(pa).toHaveURL(new RegExp(`/w/${ws}/clusters/c[a-f0-9]+$`));

  const todo = pa.locator(".cl-col").first();
  await todo.getByRole("button", { name: "+ کار تازه" }).click();
  await pa.getByPlaceholder("اسم کار…").fill("ویرایش جلد ۲");
  await pa.keyboard.press("Enter");
  await pa.getByPlaceholder("اسم کار…").press("Escape");
  await expect(todo.locator(".task", { hasText: "ویرایش جلد ۲" })).toBeVisible();

  // a link field, filled from the task sheet
  await pa.getByRole("button", { name: "فیلدها" }).click();
  await pa.getByPlaceholder("اسم فیلد").fill("منبع");
  await pa.locator(".cl-sheet .opt", { hasText: "لینک" }).click();
  await pa.locator(".cl-sheet").getByRole("button", { name: "افزودن", exact: true }).last().click();
  await expect(pa.locator(".cl-sheet .frow", { hasText: "منبع" })).toBeVisible();
  await pa.getByRole("button", { name: "بستن" }).click();

  await pa.locator(".task", { hasText: "ویرایش جلد ۲" }).click();
  await pa.getByLabel("منبع").fill("example.com");
  await pa.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/tasks/"));
  await pa.locator(".cl-sheet .opt", { hasText: "در حال انجام" }).click();
  await pa.getByRole("button", { name: "بستن" }).click();
  const doing = pa.locator(".cl-col").nth(1);
  await expect(doing.locator(".task", { hasText: "ویرایش جلد ۲" }).locator(".pill", { hasText: "example.com" })).toBeVisible();

  // and with the move menu
  await doing.locator(".task").getByRole("button", { name: "جابه‌جا کردن" }).click();
  await pa.locator(".cl-menu").getByRole("button", { name: "انجام‌شده" }).click();
  await expect(pa.locator(".cl-col").nth(2).locator(".task.fin", { hasText: "ویرایش جلد ۲" })).toBeVisible();

  await pa.reload();
  await expect(pa.locator(".cl-col").nth(2).locator(".task", { hasText: "ویرایش جلد ۲" })).toBeVisible();
});

test("dragging a card to another column moves it", async ({ browser }) => {
  const a = await signedUp();
  const ws = await workspaceWith(a);
  const c = (await a.post(`/api/ws/${ws}/clusters`, { name: "خوشه" })).body.id;
  const cols = (await a.get(`/api/ws/${ws}/clusters/${c}`)).body.columns;
  await a.post(`/api/ws/${ws}/clusters/${c}/tasks`, { col: cols[0].id, name: "کشیدنی" });
  const pa = await pageAs(browser, a);
  await pa.goto(`/w/${ws}/clusters/${c}`);
  const card = pa.locator(".task", { hasText: "کشیدنی" });
  const target = pa.locator(".cl-col").nth(1).locator(".cards");
  const from = await card.boundingBox(), to = await target.boundingBox();
  await pa.mouse.move(from.x + from.width / 2, from.y + 15);         // the middle: the move button sits at the card's end
  await pa.mouse.down();
  await pa.mouse.move(from.x + from.width / 2 - 20, from.y + 30, { steps: 3 });
  await pa.mouse.move(to.x + to.width / 2, to.y + 20, { steps: 10 });
  await pa.mouse.up();
  await expect(pa.locator(".cl-col").nth(1).locator(".task", { hasText: "کشیدنی" })).toBeVisible();
  await expect.poll(async () => (await a.get(`/api/ws/${ws}/clusters/${c}`)).body.tasks[0].col).toBe(cols[1].id);
});

test("a member sees a change someone else made, and cannot edit tasks", async ({ browser }) => {
  const a = await signedUp(), b = await signedUp();
  const ws = await workspaceWith(a, b);
  const c = (await a.post(`/api/ws/${ws}/clusters`, { name: "خوشه مشترک" })).body.id;
  const pa = await pageAs(browser, a);
  await pa.goto(`/w/${ws}/clusters/${c}`);
  await pa.getByRole("button", { name: "اعضا" }).click();
  await pa.locator(".cl-sheet .member", { hasText: "@" + b.username }).getByRole("button", { name: "افزودن" }).click();
  await expect(pa.locator(".cl-sheet .badge", { hasText: "عضو" })).toBeVisible();

  const pb = await pageAs(browser, b);
  await pb.goto(`/w/${ws}/clusters`);
  await pb.getByRole("link", { name: /خوشه مشترک/ }).click();
  await expect(pb.getByRole("button", { name: "+ کار تازه" })).toHaveCount(0);
  await expect(pb.getByRole("button", { name: "فیلدها" })).toHaveCount(0);

  const cols = (await a.get(`/api/ws/${ws}/clusters/${c}`)).body.columns;
  await a.post(`/api/ws/${ws}/clusters/${c}/tasks`, { col: cols[0].id, name: "تازه از آن طرف" });
  await expect(pb.locator(".task", { hasText: "تازه از آن طرف" })).toBeVisible({ timeout: 15_000 });
  await pb.locator(".task").click();
  await expect(pb.getByText("فقط ادمین‌ها کار را ویرایش می‌کنند")).toBeVisible();
});

test("on a phone one column shows at a time, picked from tabs", async ({ browser }) => {
  const a = await signedUp();
  const ws = await workspaceWith(a);
  const c = (await a.post(`/api/ws/${ws}/clusters`, { name: "گوشی" })).body.id;
  const pa = await pageAs(browser, a, { width: 390, height: 800 });
  await pa.goto(`/w/${ws}/clusters/${c}`);
  const tabs = pa.locator(".cl-coltabs .chip-tab");
  await expect(tabs).toHaveCount(3);
  await expect(pa.locator(".cl-col").first()).toBeInViewport();
  await expect(pa.locator(".cl-col").nth(2)).not.toBeInViewport();
  await tabs.nth(2).click();
  await expect(pa.locator(".cl-col").nth(2)).toBeInViewport();
  await expect(tabs.nth(2)).toHaveClass(/on/);
});
