// Vercel serverless funksiyasi: POST /api/contact
const { handleContact } = require("../lib/handlers");
const { run } = require("../lib/vercel-adapter");

module.exports = (req, res) => run(req, res, handleContact);
