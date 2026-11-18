// End-to-end smoke test. Serve the app first: python3 -m http.server 8765 (from the repo root).
// Usage: node tools/e2e_test.cjs [outdir-for-screenshots]
const { chromium, devices } = require("playwright");
const path = require("path");
const out = process.argv[2] || ".";
const URL = "http://127.0.0.1:8765/";
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };

(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "127.0.0.1,localhost" } : undefined;
  const b = await chromium.launch({ proxy, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  const ctx = await b.newContext({ ...devices["iPhone 13"], permissions: ["camera"], deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", e => errors.push(e.message));
  p.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  await p.goto(URL);
  await p.waitForFunction(() => /productos/.test(document.querySelector("#dbinfo").textContent), null, { timeout: 10000 });
  ok(await p.isVisible("text=Ejemplo. Escanea un producto"), "example result shown on first run");
  await p.screenshot({ path: path.join(out, "1-inicio.png"), fullPage: false });

  // 1. code from the bundled database
  const bundled = await p.evaluate(async () => (await (await fetch("db/index.json")).json()).rows.find(r => r[3] != null && r[4] >= 2)[0]);
  await p.fill("#code-in", bundled); await p.click("#code-form button[type=submit]");
  await p.waitForSelector(".res-head h2");
  await p.waitForSelector(`.res-head .code:has-text("${bundled}")`, { timeout: 10000 }).catch(() => {});
  ok(await p.isVisible("text=Datos de Open Food Facts."), `bundled product ${bundled} opens`);
  ok((await p.$$(".seal")).length >= 2, "warning seals rendered");
  await p.screenshot({ path: path.join(out, "2-resultado.png"), fullPage: true });

  // 2. history persisted in IndexedDB
  await p.click("#tab-hist");
  ok((await p.$$(".hitem")).length === 1, "viewed product saved to history");
  await p.reload(); await p.click("#tab-hist");
  ok((await p.$$(".hitem")).length === 1, "history survives reload");

  // 3. live Open Food Facts lookup for a code not in the bundle
  const live = "3017620422003"; // Nutella (France), not in the Mexico bundle
  await p.click("#tab-scan");
  await p.evaluate(c => window.__octagono.handleCode(c), live);
  await p.waitForSelector(".res-head h2", { timeout: 15000 }).catch(() => {});
  const liveName = await p.$eval(".res-head h2", e => e.textContent).catch(() => "");
  ok(/nutella/i.test(liveName), `live lookup works (${liveName || "no result"})`);

  // 4. unknown code -> label capture panel (no API key)
  await p.evaluate(() => { window.__octagono.handleCode("0000000000017"); });
  await p.waitForSelector(".cap", { timeout: 15000 });
  ok(await p.isVisible("text=agrega tu clave de la API"), "unknown product asks for label photos / API key");
  await p.click(".cap .cancel");

  // 5. compare via search
  await p.click("#tab-cmp");
  const firstWord = await p.evaluate(async () => (await (await fetch("db/index.json")).json()).rows.find(r => r[3] != null)[1].split(" ")[0]);
  await p.fill('[data-q="0"]', firstWord); await p.click('[data-hits="0"] button[data-code]');
  const secondWord = await p.evaluate(async () => { const rows = (await (await fetch("db/index.json")).json()).rows.filter(r => r[3] != null); return rows[rows.length - 1][1].split(" ")[0]; });
  await p.fill('[data-q="1"]', secondWord); await p.click('[data-hits="1"] button[data-code]');
  ok((await p.$$("#cmp-table tr")).length > 5, "compare table shows two products");
  await p.screenshot({ path: path.join(out, "3-comparar.png"), fullPage: true });

  // 6. camera overlay opens and closes
  await p.click("#tab-scan"); await p.click("#scan-btn");
  await p.waitForSelector("#cam:not([hidden])", { timeout: 5000 }).catch(() => {});
  ok(await p.isVisible("#cam"), "camera scanner opens");
  await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(out, "4-camara.png") });
  await p.click("#cam-close");
  ok(!(await p.isVisible("#cam")), "camera scanner closes");

  // 7. settings + dark mode render
  await p.click("#open-settings");
  ok(await p.isVisible("text=Clave de la API de Claude"), "settings open");
  await p.emulateMedia({ colorScheme: "dark" });
  await p.click("#tab-hist");
  await p.screenshot({ path: path.join(out, "5-historial-oscuro.png") });

  // 8. service worker registered
  ok(await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())), "service worker registered");
  const wide = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  ok(!wide, "no horizontal scroll at phone width");
  ok(errors.length === 0, "no console errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close();
})();
