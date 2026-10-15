// Mini app launch data signed the way Telegram signs it, for tests.
import crypto from "node:crypto";

/** @param {string} botToken @param {object} user @param {{ authDate?: number, startParam?: string }} [o] */
export function signedInitData(botToken, user, o = {}) {
  const p = new URLSearchParams({ auth_date: String(o.authDate ?? Math.floor(Date.now() / 1000)), user: JSON.stringify(user) });
  if (o.startParam) p.set("start_param", o.startParam);
  const check = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  p.set("hash", crypto.createHmac("sha256", secret).update(check).digest("hex"));
  return p.toString();
}
