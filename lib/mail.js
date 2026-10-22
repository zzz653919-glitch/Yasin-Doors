/**
 * Email yuborish (parolni tiklash). Qo'shimcha kutubxonasiz: Resend HTTP API (https://resend.com).
 *   RESEND_API_KEY  — API kalit (faqat serverda)
 *   MAIL_FROM       — jo'natuvchi, masalan: YasinDoors <noreply@yasindoors.uz> (domen Resend'da tasdiqlangan bo'lishi kerak)
 *   APP_URL         — saytning ommaviy manzili (tiklash havolasi shundan yasaladi), masalan: https://yasindoors.uz
 *   MAIL_DRY_RUN=true — yubormasdan havolani server konsoliga chiqaradi (FAQAT lokal sinov uchun)
 * Sozlanmagan bo'lsa configured() = false va tiklash endpointi aniq xato qaytaradi (soxta "yuborildi" yo'q).
 */
"use strict";

// Ishlab chiqarishda (Vercel / NODE_ENV=production) e'tiborsiz: tiklash havolasi hech qachon logga chiqmasin
const dryRun = () => String(process.env.MAIL_DRY_RUN).toLowerCase() === "true" && !process.env.VERCEL && process.env.NODE_ENV !== "production";
const configured = () => dryRun() || !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

/** Havola uchun asos manzil: so'rov sarlavhalaridan EMAS (Host-header hujumi), faqat sozlamadan */
function appUrl() {
  const u = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL : "");
  if (u) return u.replace(/\/+$/, "");
  if (!process.env.VERCEL) return "http://localhost:" + (process.env.PORT || 3000);
  return "";
}

async function send({ to, subject, text, html }) {
  if (dryRun()) {
    console.log(`\n[MAIL_DRY_RUN] Email yuborilmadi.\nKimga: ${to}\nMavzu: ${subject}\n${text}\n`);
    return { sent: false, dry: true };
  }
  if (!configured()) return { sent: false, reason: "not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.RESEND_API_KEY },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) { console.error("Email xatosi:", res.status); return { sent: false, reason: "failed" }; }
    return { sent: true };
  } catch (e) {
    console.error("Email tarmoq xatosi:", e.name);
    return { sent: false, reason: "failed" };
  }
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function resetEmail(name, link) {
  const text = `Assalomu alaykum, ${name}!\n\nYasinDoors hisobingiz uchun parolni almashtirish so‘rovi qabul qilindi.\nYangi parol o‘rnatish uchun havolaga o‘ting (1 soat amal qiladi, bir martalik):\n\n${link}\n\nAgar parolni almashtirishni siz so‘ramagan bo‘lsangiz, bu xatga e’tibor bermang — parolingiz o‘zgarishsiz qoladi.\n\nYasinDoors`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#1a1a1a"><h2 style="margin:0 0 16px">Parolni almashtirish</h2><p>Assalomu alaykum, ${esc(name)}!</p><p>YasinDoors hisobingiz uchun parolni almashtirish so‘rovi qabul qilindi. Havola 1 soat amal qiladi va faqat bir marta ishlaydi.</p><p style="margin:24px 0"><a href="${esc(link)}" style="background:#111;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block">Yangi parol o‘rnatish</a></p><p style="color:#666;font-size:13px">Agar parolni almashtirishni siz so‘ramagan bo‘lsangiz, bu xatga e’tibor bermang.</p></div>`;
  return { subject: "YasinDoors — parolni almashtirish", text, html };
}

module.exports = { configured, dryRun, appUrl, send, resetEmail };
