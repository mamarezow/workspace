import { test, expect, request } from "@playwright/test";
import { BASE, person, signedUp, uniq } from "./helpers.mjs";
import { signedInitData } from "../telegram-data.mjs";
import { BOT_TOKEN } from "../../playwright.config.mjs";

test("sign up, see yourself, sign out", async () => {
  const p = await signedUp();
  expect(p.user).toMatchObject({ username: p.username, lang: "fa", cal: "shamsi", weekStart: 6, hasPassword: true });
  expect(p.user).not.toHaveProperty("pass_hash");
  expect((await p.post("/api/auth/logout")).status).toBe(200);
  expect((await p.get("/api/me")).status).toBe(401);
});

test("the session cookie is http-only", async () => {
  const p = await person();
  const r = await p.post("/api/auth/signup", { username: uniq(), password: "pass1234" });
  expect(r.headers["set-cookie"]).toMatch(/sid=[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=Lax/);
});

test("sign up refuses bad and taken usernames and short passwords", async () => {
  const p = await signedUp();
  const q = await person();
  expect((await q.post("/api/auth/signup", { username: "a!", password: "pass1234" })).body.error).toBe("username_invalid");
  expect((await q.post("/api/auth/signup", { username: p.username.toUpperCase(), password: "pass1234" })).status).toBe(409);
  expect((await q.post("/api/auth/signup", { username: uniq(), password: "123" })).body.error).toBe("password_short");
});

test("sign in with the right password only, and lock after ten wrong tries", async () => {
  const p = await signedUp();
  const q = await person();
  expect((await q.post("/api/auth/login", { username: p.username, password: "nope" })).status).toBe(401);
  expect((await q.post("/api/auth/login", { username: p.username, password: p.password })).status).toBe(200);
  for (let i = 0; i < 10; i++) await q.post("/api/auth/login", { username: p.username, password: "nope" });
  expect((await q.post("/api/auth/login", { username: p.username, password: p.password })).status).toBe(429);
});

test("changes need our own page's header", async () => {
  const bare = await request.newContext({ baseURL: BASE });
  const r = await bare.post("/api/auth/signup", { data: { username: uniq(), password: "pass1234" } });
  expect(r.status()).toBe(403);
});

test("profile and settings are saved and checked", async () => {
  const p = await signedUp();
  const r = await p.patch("/api/me", { display: "  سارا  ", about: "طراح", email: "sara@gmail.com", lang: "en", cal: "gregorian", weekStart: 1 });
  expect(r.body.user).toMatchObject({ display: "سارا", about: "طراح", email: "sara@gmail.com", lang: "en", cal: "gregorian", weekStart: 1 });
  expect((await p.patch("/api/me", { email: "not-an-email" })).body.error).toBe("email_invalid");
  expect((await p.patch("/api/me", { weekStart: 3 })).body.error).toBe("bad_request");
  expect((await p.get("/api/me")).body.user.display).toBe("سارا");
});

test("a new username keeps the same account", async () => {
  const p = await signedUp();
  const next = uniq("n");
  expect((await p.post("/api/me/username", { username: next, password: "wrong" })).status).toBe(403);
  expect((await p.post("/api/me/username", { username: next, password: p.password })).body.username).toBe(next);
  expect((await p.get("/api/me")).body.user).toMatchObject({ id: p.user.id, username: next });
});

test("a new password signs out other devices but not this one", async () => {
  const p = await signedUp();
  const other = await person();
  await other.post("/api/auth/login", { username: p.username, password: p.password });
  expect((await p.post("/api/me/password", { current: p.password, next: "newpass99" })).status).toBe(200);
  expect((await p.get("/api/me")).status).toBe(200);
  expect((await other.get("/api/me")).status).toBe(401);
  expect((await other.post("/api/auth/login", { username: p.username, password: "newpass99" })).status).toBe(200);
});

test.describe("Telegram", () => {
  const tgUser = () => ({ id: Math.floor(Math.random() * 1e9), username: uniq("tg"), first_name: "Mina" });

  test("first visit makes an account, the next one signs into it", async () => {
    const tg = tgUser();
    const a = await person();
    const first = await a.post("/api/auth/telegram", { initData: signedInitData(BOT_TOKEN, tg) });
    expect(first.body).toMatchObject({ ok: true, fresh: true });
    const me = (await a.get("/api/me")).body.user;
    expect(me).toMatchObject({ username: tg.username, display: "Mina", hasPassword: false, autoMade: true });
    expect(me.telegram).toMatchObject({ username: tg.username });

    const b = await person();
    expect((await b.post("/api/auth/telegram", { initData: signedInitData(BOT_TOKEN, tg) })).body.fresh).toBe(false);
    expect((await b.get("/api/me")).body.user.id).toBe(me.id);
  });

  test("forged launch data is refused", async () => {
    const a = await person();
    expect((await a.post("/api/auth/telegram", { initData: signedInitData("1:other", tgUser()) })).status).toBe(401);
  });

  test("moving to an older account drops the one made automatically", async () => {
    const old = await signedUp();
    const tg = tgUser(), initData = signedInitData(BOT_TOKEN, tg);
    const a = await person();
    await a.post("/api/auth/telegram", { initData });
    const auto = (await a.get("/api/me")).body.user;
    const r = await a.post("/api/me/telegram/switch", { initData, username: old.username, password: old.password });
    expect(r.status).toBe(200);
    expect((await a.get("/api/me")).body.user.id).toBe(old.user.id);
    expect((await old.get("/api/me")).body.user.telegram).toMatchObject({ username: tg.username });
    const gone = await person();
    expect((await gone.post("/api/auth/login", { username: auto.username, password: "x" })).status).toBe(401);
  });

  test("an account without a password cannot drop its Telegram", async () => {
    const a = await person();
    await a.post("/api/auth/telegram", { initData: signedInitData(BOT_TOKEN, tgUser()) });
    expect((await a.del("/api/me/telegram")).body.error).toBe("set_password_first");
  });
});
