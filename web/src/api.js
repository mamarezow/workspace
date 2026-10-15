// Talking to the server. Every call sends the header the server asks for on changes.

export class ApiError extends Error {
  /** @param {string} code @param {number} status */
  constructor(code, status) { super(code); this.status = status; }
}

/** @param {string} method @param {string} path @param {unknown} [body] */
export async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { "x-ws": "1", ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError("offline", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || "server_error", res.status);
  return data;
}
