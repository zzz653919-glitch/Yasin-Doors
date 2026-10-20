// Vercel serverless funksiyasi: barcha /api/* so'rovlari shu yerdan lib/router.js ga o'tadi
// (Vercel Hobby rejasidagi funksiyalar soni chegarasini tejash uchun bitta funksiya).
const { handle } = require("../lib/router");

module.exports = (req, res) => handle(req, res);
