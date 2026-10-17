// Vercel (Node.js runtime) uchun umumiy o‘ram: faqat POST, JSON javob
"use strict";

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  return (fwd ? String(fwd).split(",")[0] : req.socket && req.socket.remoteAddress) || "unknown";
}

async function run(req, res, handler) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.statusCode = 405;
    return res.end(JSON.stringify({ ok: false, error: "Faqat POST so‘rovi qabul qilinadi." }));
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }

  try {
    const result = await handler(body, clientIp(req));
    res.statusCode = result.status;
    res.end(JSON.stringify(result.body));
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: "Server xatosi." }));
  }
}

module.exports = { run, clientIp };
