// Hashing, random tokens and comparisons. Web Crypto only, so it runs on Workers and in Node tests.
const enc = new TextEncoder();

/** @param {ArrayBuffer | Uint8Array} buf */
export const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");

/** n random bytes as hex. @param {number} n */
export const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));

/** @param {string} s */
export const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));

/** Compares two strings in time that does not depend on where they differ. @param {string} a @param {string} b */
export function sameText(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const PBKDF2_ROUNDS = 100_000;   // the most Workers allow

/** @param {string} password @param {string} salt */
export async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: PBKDF2_ROUNDS }, key, 256);
  return hex(bits);
}

/** @param {string | Uint8Array} key @param {string} data */
export async function hmac(key, data) {
  const raw = typeof key === "string" ? enc.encode(key) : new Uint8Array(key);
  const k = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
