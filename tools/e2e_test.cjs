// End-to-end smoke test. Serve the app first: python3 -m http.server 8765 (from the repo root).
// Usage: node tools/e2e_test.cjs [outdir-for-screenshots]
const { chromium, devices } = require("playwright");
const path = require("path");
const out = process.argv[2] || ".";
const URL = process.env.APP_URL || "http://127.0.0.1:8765/";
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };

(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "127.0.0.1,localhost" } : undefined;
  const b = await chromium.launch({ proxy, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  const ctx = await b.newContext({ ...devices["iPhone 13"], permissions: ["camera"], deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", e => errors.push(e.message));
  // the fake-key checks below cause expected 401 responses; anything else is a real error
  p.on("console", m => { if (m.type() === "error" && !/status of 401/.test(m.text())) errors.push(m.text()); });

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
  await p.waitForSelector('.cmp-col [data-clear="0"]', { timeout: 15000 }).catch(() => {});
  const secondWord = await p.evaluate(async () => { const rows = (await (await fetch("db/index.json")).json()).rows.filter(r => r[3] != null); return rows[rows.length - 1][1].split(" ")[0]; });
  await p.fill('[data-q="1"]', secondWord); await p.click('[data-hits="1"] button[data-code]');
  await p.waitForSelector("#cmp-table tr:nth-child(5)", { timeout: 15000 }).catch(() => {});
  ok((await p.$$("#cmp-table tr")).length > 5, "compare table shows two products");
  await p.screenshot({ path: path.join(out, "3-comparar.png"), fullPage: true });

  // 5b. COFEPRIS: a product named in an alert shows the warning; the Alerts tab lists everything
  const pedia = await p.evaluate(async () => (await (await fetch("db/index.json")).json()).rows.find(r => /pediasure/i.test(r[1]))?.[0]);
  await p.click("#tab-scan");
  await p.evaluate(c => { window.__octagono.handleCode(c); }, pedia);
  await p.waitForSelector(".res .warn", { timeout: 10000 }).catch(() => {});
  ok(await p.isVisible("text=PediaSure chocolate alterado"), `COFEPRIS warning on ${pedia}`);
  await p.screenshot({ path: path.join(out, "6-alerta-producto.png"), fullPage: true });
  await p.click("#tab-alert");
  ok((await p.$$(".aitem")).length >= 40, "alerts tab lists COFEPRIS alerts");
  ok(await p.isVisible("#alert-mine .warn"), "alerts tab flags products in history");
  await p.click('#alert-cats [data-cat="bebidas"]');
  ok((await p.$$(".aitem")).length === 3, "category filter works");
  await p.screenshot({ path: path.join(out, "7-alertas.png"), fullPage: false });

  // 5c. AI label reading path with a fake key: SDK loads, request reaches the API, 401 is reported clearly
  await p.click("#open-settings");
  await p.fill("#key-in", "sk-ant-api03-fake-key-for-testing"); await p.click("#key-save");
  await p.click("#key-test");
  await p.waitForFunction(() => !/Probando/.test(document.querySelector("#key-test-state").textContent), null, { timeout: 30000 }).catch(() => {});
  const keyMsg = await p.textContent("#key-test-state");
  ok(/no es válida/.test(keyMsg), `key test reaches the API (${keyMsg.trim()})`);
  await p.click("#tab-scan");
  await p.evaluate(() => { window.__octagono.handleCode("0000000000024"); });
  await p.waitForSelector(".cap .slots", { timeout: 15000 });
  const [chooser] = await Promise.all([p.waitForEvent("filechooser"), p.click('.cap [data-pick="0"]')]);
  await chooser.setFiles(path.join(__dirname, "..", "icons", "icon-512.png"));
  await p.click(".cap .go");
  await p.waitForFunction(() => { const s = document.querySelector(".cap .st"); return s && !/Leyendo/.test(s.textContent) && s.textContent; }, null, { timeout: 45000 }).catch(() => {});
  const capMsg = (await p.textContent(".cap .st").catch(() => "")) || "";
  ok(/no es válida/.test(capMsg), `label reading reaches the API (${capMsg.trim()})`);
  await p.click(".cap .cancel");
  await p.evaluate(() => localStorage.removeItem("octagono.apikey"));

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
