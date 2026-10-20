/** HTTP yordamchilari: xato sinfi, tana o'qish, IP, Origin tekshiruvi, xavfsizlik sarlavhalari */
"use strict";

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || {};
  }
}
const bad = (msg, extra) => new HttpError(400, msg, extra);
const notFound = msg => new HttpError(404, msg || "Topilmadi.");
const forbidden = (msg, extra) => new HttpError(403, msg || "Bu amal uchun ruxsat yo'q.", extra);
const conflict = (msg, extra) => new HttpError(409, msg, extra);

/**
 * Mijoz IP'si. X-Forwarded-For faqat ishonchli proksi ortida (Vercel yoki TRUST_PROXY=true) ishlatiladi:
 * aks holda uni soxtalashtirib IP bo'yicha cheklovlarni (login, ro'yxatdan o'tish) aylanib o'tish mumkin bo'lardi.
 */
function clientIp(req) {
  const trusted = !!process.env.VERCEL || String(process.env.TRUST_PROXY).toLowerCase() === "true";
  const fwd = trusted && req.headers["x-forwarded-for"];
  return String(fwd ? String(fwd).split(",")[0] : (req.socket && req.socket.remoteAddress) || "unknown").trim();
}

const MAX_BODY = 4 * 1024 * 1024; // 4MB (Vercel chegarasi 4.5MB)

async function readBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") {
      if (!req.body.trim()) return {};
      try { return JSON.parse(req.body); } catch (e) { throw bad("Noto'g'ri JSON."); }
    }
    if (Buffer.isBuffer(req.body)) {
      try { return JSON.parse(req.body.toString("utf8")); } catch (e) { throw bad("Noto'g'ri JSON."); }
    }
    return req.body;
  }
  if (typeof req.on !== "function") return {}; // stream yo'q (masalan, sinov muhiti) — bo'sh tana
  const chunks = [];
  let size = 0;
  await new Promise((resolve, reject) => {
    req.on("data", c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, "So'rov hajmi juda katta.")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", resolve);
    req.on("error", reject);
  });
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch (e) { throw bad("Noto'g'ri JSON."); }
}

/** CSRF qatlamlaridan biri: Origin sarlavhasi bo'lsa, u shu sayt bilan bir xil bo'lishi kerak */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin GET/fetch ba'zan yubormaydi; asosiy himoya token + SameSite
  try {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    return new URL(origin).host === String(host).split(",")[0].trim();
  } catch (e) {
    return false;
  }
}

function baseHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin"
  };
}

module.exports = { HttpError, bad, notFound, forbidden, conflict, clientIp, readBody, sameOrigin, baseHeaders };
