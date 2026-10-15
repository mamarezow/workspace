// A stand-in for api.telegram.org during the e2e tests: it answers every Bot API call with ok
// and keeps what was sent, which the tests read at GET /sent.
import { createServer } from "node:http";

const sent = [];
createServer((req, res) => {
  if (req.method === "GET" && req.url === "/sent") {
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify(sent));
  }
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    const method = String(req.url).split("/").pop();
    let data = null;
    try { data = JSON.parse(body); } catch {}
    sent.push({ method, body: data });
    const blocked = data?.chat_id === 666;      // a person who blocked the bot
    res.statusCode = blocked ? 403 : 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(blocked ? { ok: false, description: "Forbidden: bot was blocked by the user" } : { ok: true, result: true }));
  });
}).listen(8790, "127.0.0.1");
