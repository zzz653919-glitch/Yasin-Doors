/* Toza URL manzillar (.html ko'rinmaydi). Vercel (vercel.json) va lokal server (server.js) shu ro'yxatga tayanadi.
   Katta-kichik harf farqlanmaydi: /About ham, /about ham ochiladi. */
const PAGES = [
  { path: "/", file: "index.html", alias: ["/Home"] },
  { path: "/About", file: "about.html" },
  { path: "/Products", file: "products.html" },
  { path: "/Product", file: "product-detail.html" },
  { path: "/Contact", file: "contact.html" },
  { path: "/Cart", file: "cart.html" },
  { path: "/Favorites", file: "favorites.html" },
  { path: "/Checkout", file: "checkout.html" },
  { path: "/Configurator", file: "configurator.html" },
  { path: "/Login", file: "login.html" },
  { path: "/Register", file: "register.html" },
  { path: "/Forgot-Password", file: "forgot-password.html" },
  { path: "/Reset-Password", file: "reset-password.html" },
  { path: "/Profile", file: "profile.html" },
  { path: "/Privacy", file: "privacy.html" },
  { path: "/Terms", file: "terms.html" },
  { path: "/Admin", file: "admin/index.html" }
];

/** pathname -> { file } | { redirect } | null */
function resolvePage(pathname) {
  let p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const low = p.toLowerCase();
  if (low === "/admin") return { file: "admin/index.html" };   // /Admin ham, /admin ham (yo'naltirish yo'q: katta-kichik harf farqsiz mosligida halqa bo'lmasin)
  if (low === "/admin/index.html") return { redirect: "/Admin" };
  for (const pg of PAGES) {
    if (pg.path === "/") {
      if (low === "/index.html" || low === "/home") return { redirect: "/" };
      continue;
    }
    if (low === pg.path.toLowerCase()) return { file: pg.file };
    if (low === "/" + pg.file.toLowerCase()) return { redirect: pg.path };
  }
  return null;
}

module.exports = { PAGES, resolvePage };
