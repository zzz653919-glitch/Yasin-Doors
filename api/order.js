// Vercel serverless funksiyasi: POST /api/order
const { handleOrder } = require("../lib/handlers");
const { run } = require("../lib/vercel-adapter");

module.exports = (req, res) => run(req, res, handleOrder);
