// Answers, errors and request bodies, shared by every part of the server.

/** An error that becomes an answer: `throw new HttpError("not_found", 404)`. */
export class HttpError extends Error {
  /** @param {string} code @param {number} [status] */
  constructor(code, status = 400) {
    super(code);
    this.status = status;
  }
}

/** @param {unknown} body @param {number} [status] @param {Record<string, string>} [headers] */
export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

const MAX_BODY = 400_000;

/** The request's JSON body; an empty body is `{}`. @param {Request} req @returns {Promise<Record<string, any>>} */
export async function readBody(req) {
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError("too_big", 413);
  if (!text) return {};
  let body;
  try { body = JSON.parse(text); } catch { throw new HttpError("bad_request"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError("bad_request");
  return body;
}

/** Text people type, trimmed and kept to a sensible length. @param {unknown} v @param {number} [max] */
export const cleanText = (v, max = 200) => String(v ?? "").trim().slice(0, max);
