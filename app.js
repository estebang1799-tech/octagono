import { num, norm, normCode, compute, fromOFF, unpack, OFF_FIELDS } from "./logic.js";

const VERSION = "1.0.0";
const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.4.0/+esm";
const MODEL = "claude-opus-5-5";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (v, d = 1) => v == null ? "—" : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString("es-MX");
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };

/* =========================================================
   Local history (IndexedDB)
   ========================================================= */
let history = [];
const idb = (() => {
  let dbp = null;
  const open = () => dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open("octagono", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("products", { keyPath: "id" });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => {
    const t = db.transaction("products", mode), s = t.objectStore("products"); const out = fn(s);
    t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); }); };
  return { all: () => tx("readonly", s => s.getAll()), put: doc => tx("readwrite", s => s.put(doc)), del: id => tx("readwrite", s => s.delete(id)) };
})();
async function loadHistory() {
  try { history = (await idb.all()).sort((a, b) => b.ts - a.ts); } catch { history = []; }
  refreshViews();
}
const findKnown = code => code ? history.find(h => h.barcode === code) : null;
async function save(product, thumb, id) {
  const r = compute(product), barcode = normCode(product.codigo_barras) || null;
  const prev = (id && history.find(h => h.id === id)) || findKnown(barcode);
  const doc = { id: prev?.id || id || crypto.randomUUID(), product, score: r.score, seals: r.seals, thumb: thumb ?? prev?.thumb ?? null, barcode, ts: Date.now() };
  try { await idb.put(doc); } catch { $("#scan-msg").innerHTML = `<div class="msg err">No se pudo guardar en tu historial.</div>`; return doc.id; }
  history = [doc, ...history.filter(h => h.id !== doc.id)];
  return doc.id;
}

/* =========================================================
   Product sources: bundled Open Food Facts + live API
   ========================================================= */
let INDEX = null, META = null; const SHARDS = {};
async function loadIndex() {
  try {
    const j = await (await fetch("db/index.json")).json(); INDEX = j.rows; META = j.meta;
    $("#dbinfo").textContent = `${INDEX.length.toLocaleString("es-MX")} productos mexicanos sin conexión, más búsqueda en vivo.`;
    $("#db-detail").textContent = `${INDEX.length.toLocaleString("es-MX")} productos de Open Food Facts México, descargados el ${META.date}.`;
  } catch { $("#dbinfo").textContent = "Base sin conexión no disponible; se busca en vivo."; }
}
function shardFor(code) {
  const k = code.slice(-1);
  return SHARDS[k] ??= fetch(`db/s${k}.json`).then(r => r.json()).catch(() => { delete SHARDS[k]; return {}; });
}
async function lookupBundle(code) { const row = (await shardFor(code))[code]; return row ? unpack(code, row) : null; }
async function lookupLive(code) {
  if (!navigator.onLine) return null;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS},image_front_small_url`, { signal: ctl.signal });
    if (!r.ok) return null;
    const j = await r.json(); if (j.status !== 1 || !j.product) return null;
    const p = fromOFF({ ...j.product, code }); if (p) p.imagen = j.product.image_front_small_url || null;
    return p;
  } catch { return null; } finally { clearTimeout(t); }
}
async function findAny(code, msgEl) {
  const k = findKnown(code); if (k) return { product: structuredClone(k.product), docId: k.id, thumb: k.thumb };
  const b = await lookupBundle(code); if (b) return { product: b, docId: null, thumb: null };
  if (msgEl) msgEl.innerHTML = `<div class="msg">Buscando en Open Food Facts…</div>`;
  const l = await lookupLive(code); if (msgEl) msgEl.innerHTML = "";
  return l ? { product: l, docId: null, thumb: null } : null;
}
function alternatives(p, n = 3) {
  if (!INDEX || !p.cat) return [];
  const mine = compute(p).score ?? 0;
  return INDEX.filter(r => r[5] === p.cat && r[0] !== p.codigo_barras && r[3] != null && r[3] >= mine + 10)
    .sort((a, b) => b[3] - a[3] || a[4] - b[4]).slice(0, n);
}

/* =========================================================
   Barcode: live camera, with photo fallback
   ========================================================= */
const loadImg = file => new Promise((res, rej) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { res(im); URL.revokeObjectURL(u); }; im.onerror = rej; im.src = u; });
function toCanvas(src, max, rot = 0, crop = null) {
  const sw = src.videoWidth || src.naturalWidth, sh = src.videoHeight || src.naturalHeight;
  const [cx, cy, cw, ch] = crop || [0, 0, sw, sh];
  const k = Math.min(1, max / Math.max(cw, ch)), w = Math.round(cw * k), h = Math.round(ch * k), c = document.createElement("canvas");
  c.width = rot ? h : w; c.height = rot ? w : h;
  const g = c.getContext("2d", { willReadFrequently: true }); if (rot) { g.translate(h, 0); g.rotate(Math.PI / 2); }
  g.drawImage(src, cx, cy, cw, ch, 0, 0, w, h);
  return c;
}
let zxReader = null;
function zxDecode(canvas) {
  const Z = window.ZXing; if (!Z) return null;
  if (!zxReader) {
    const hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    zxReader = new Z.MultiFormatReader(); zxReader.setHints(hints);
  }
  try { return zxReader.decodeWithState(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)))).getText(); } catch { return null; }
}
let nativeDet = null;
async function getNativeDetector() {
  if (nativeDet !== null) return nativeDet;
  nativeDet = false;
  try {
    if ("BarcodeDetector" in window) {
      const f = await BarcodeDetector.getSupportedFormats();
      if (f.includes("ean_13")) nativeDet = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"].filter(x => f.includes(x)) });
    }
  } catch {}
  return nativeDet;
}
const validEAN = c => { if (!/^\d{8}$|^\d{12,14}$/.test(c)) return false; const d = [...c].map(Number), chk = d.pop();
  const s = d.reverse().reduce((a, x, i) => a + x * (i % 2 ? 1 : 3), 0); return (10 - s % 10) % 10 === chk; };

function openScanner() {
  return new Promise(async resolve => {
    if (!navigator.mediaDevices?.getUserMedia) return resolve(await scanFromPhoto());
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }); }
    catch (e) {
      $("#scan-msg").innerHTML = `<div class="msg err">${e?.name === "NotAllowedError" ? "No diste permiso para la cámara. Puedes activarlo en los ajustes del navegador. Mientras, toma una foto del código." : "No se pudo abrir la cámara. Toma una foto del código."}</div>`;
      return resolve(await scanFromPhoto());
    }
    const cam = $("#cam"), video = $("#cam-video"), track = stream.getVideoTracks()[0];
    video.srcObject = stream; cam.hidden = false; $("#cam-msg").textContent = "Apunta al código de barras";
    try { await video.play(); } catch {}
    const det = await getNativeDetector();
    let done = false, torch = false, last = null, hits = 0;
    const caps = track.getCapabilities?.() || {};
    $("#cam-torch").hidden = !caps.torch;
    $("#cam-torch").onclick = async () => { torch = !torch; try { await track.applyConstraints({ advanced: [{ torch }] }); } catch {} };
    const finish = code => {
      if (done) return; done = true;
      stream.getTracks().forEach(t => t.stop()); video.srcObject = null; cam.hidden = true;
      if (code) navigator.vibrate?.(60);
      resolve(code ? normCode(code) : null);
    };
    $("#cam-close").onclick = () => finish(null);
    const tick = async () => {
      if (done) return;
      if (video.readyState >= 2) {
        let code = null;
        if (det) { try { const r = await det.detect(video); code = r.find(x => validEAN(normCode(x.rawValue)))?.rawValue || null; } catch {} }
        else {
          const vw = video.videoWidth, vh = video.videoHeight;
          code = zxDecode(toCanvas(video, 1280, 0, [vw * .08, vh * .3, vw * .84, vh * .4])) || zxDecode(toCanvas(video, 1280));
        }
        if (code && validEAN(normCode(code))) {
          // ZXing can misread a digit on a blurry frame; require two matching reads unless the native detector found it
          if (det || code === last) { hits++; if (det || hits >= 1) return finish(code); }
          last = code;
        }
      }
      setTimeout(tick, det ? 120 : 60);
    };
    tick();
  });
}
const filePick = () => new Promise(res => { const fi = $("#file-in"); fi.value = ""; fi.onchange = () => res(fi.files[0] || null); fi.click(); });
async function scanFromPhoto() {
  const f = await filePick(); if (!f) return null;
  const im = await loadImg(f).catch(() => null); if (!im) return null;
  const det = await getNativeDetector();
  if (det) { try { const r = await det.detect(im); if (r[0]?.rawValue) return normCode(r[0].rawValue); } catch {} }
  for (const [max, rot] of [[1400, 0], [1400, 1], [900, 0], [2000, 0], [900, 1]]) { const c = zxDecode(toCanvas(im, max, rot)); if (c) return normCode(c); }
  $("#scan-msg").innerHTML = `<div class="msg err">No encontré un código de barras en la foto. Acércate y usa buena luz.</div>`;
  return null;
}

/* =========================================================
   Label reading with the Claude API (user's own key)
   ========================================================= */
const N = { type: ["number", "null"] }, S = { type: ["string", "null"] }, B = { type: "boolean" };
const LABEL_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    nombre: { type: "string" }, marca: S, contenido: S, codigo_barras: S, tipo: { type: "string", enum: ["solido", "liquido"] },
    kcal: N, azucares_totales: N, azucares_anadidos: N, grasa_saturada: N, grasa_trans: N, sodio_mg: N, fibra: N, proteina: N,
    ingredientes: S, aditivos: { type: "array", items: { type: "string" } },
    edulcorantes: B, cafeina: B, tiene_azucar_anadido: B, tiene_sodio_anadido: B,
    legible: B, nota: S, consejo: { type: "string" },
  },
};
LABEL_SCHEMA.required = Object.keys(LABEL_SCHEMA.properties);
const LABEL_PROMPT = `These photos show a food or drink sold in Mexico: its nutrition table, ingredient list and/or front of pack. Read them and fill in the JSON fields.

- Give every nutrition value per 100 g for solids or per 100 ml for liquids. If the table only shows values per serving, convert using the serving size printed on the label.
- sodio_mg is sodium in milligrams.
- When a value isn't visible, use null rather than estimating it; the app treats null as unknown.
- aditivos lists the additives in the ingredient list, with their E or INS number when you know it, e.g. "Sucralosa (E955)".
- codigo_barras is the digits under the barcode, only if all of them are readable.
- Set legible to false if the photos aren't of a food or drink label, and explain in nota anything you couldn't read.
- consejo is one short sentence in Spanish suggesting what kind of healthier product to choose instead at a Mexican supermarket. Keep it generic; don't name brands or invent figures.
- Write nombre, nota and ingredientes in Spanish, as printed on the label.`;

const apiKey = () => store.get("octagono.apikey");
let sdkPromise = null;
async function readLabel(blobs, signal) {
  const key = apiKey(); if (!key) throw { code: "no_key" };
  sdkPromise ??= import(SDK_URL);
  let Anthropic;
  try { Anthropic = (await sdkPromise).default; } catch { sdkPromise = null; throw { code: "offline" }; }
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  const images = await Promise.all(blobs.map(async b => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: await blobToB64(b) } })));
  let resp;
  try {
    resp = await client.beta.messages.create({
      model: MODEL, max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: LABEL_SCHEMA } },
      messages: [{ role: "user", content: [...images, { type: "text", text: LABEL_PROMPT }] }],
    }, { signal });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw { code: "bad_key" };
    if (e instanceof Anthropic.RateLimitError) throw { code: "rate_limited" };
    if (e instanceof Anthropic.APIUserAbortError || signal?.aborted) throw { code: "cancelled" };
    if (e instanceof Anthropic.BadRequestError) throw { code: "bad_request", message: e.message };
    if (e instanceof Anthropic.APIConnectionError) throw { code: "offline" };
    throw { code: "api", message: e?.message };
  }
  if (resp.stop_reason === "refusal") throw { code: "refused" };
  const text = resp.content.filter(b => b.type === "text").map(b => b.text).join("");
  try { return JSON.parse(text); } catch { throw { code: "invalid_json" }; }
}
const blobToB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(b); });
const shrink = (im, max) => new Promise(r => toCanvas(im, max).toBlob(r, "image/jpeg", 0.85));
async function thumbOf(f) {
  const im = await loadImg(f), S2 = 96, c = document.createElement("canvas"); c.width = c.height = S2;
  const m = Math.min(im.naturalWidth, im.naturalHeight);
  c.getContext("2d").drawImage(im, (im.naturalWidth - m) / 2, (im.naturalHeight - m) / 2, m, m, 0, 0, S2, S2);
  return c.toDataURL("image/jpeg", 0.6);
}
const SLOTS = ["Tabla nutrimental", "Ingredientes", "Frente"];
function captureLabel(host, { code = null, title } = {}) {
  return new Promise(resolve => {
    const photos = [null, null, null]; let ctl = null;
    const hasKey = !!apiKey();
    host.innerHTML = `<div class="cap">
      <div><b>${esc(title || "Producto nuevo")}</b>${code ? ` <span class="code small muted">${esc(code)}</span>` : ""}</div>
      <p class="small muted" style="margin:0">${code ? "No está en Open Food Facts. " : ""}Toma la tabla nutrimental y la lista de ingredientes. Solo se hace una vez por producto.</p>
      ${hasKey ? `<div class="slots"></div>
      <div class="row"><button class="btn y go" style="flex:1" disabled>Analizar</button><button class="btn line cancel">Cancelar</button></div>`
      : `<div class="msg">Para leer etiquetas con fotos, agrega tu clave de la API de Claude en <button class="link to-set">Ajustes</button>. También puedes capturar los datos a mano.</div>
      <div class="row"><button class="btn line cancel">Cancelar</button></div>`}
      <button class="link small manual" style="align-self:flex-start">Capturar a mano</button>
      <div class="st small muted"></div></div>`;
    const q = s => host.querySelector(s), st = q(".st");
    const draw = () => {
      if (!hasKey) return;
      q(".slots").innerHTML = SLOTS.map((l, i) => photos[i]
        ? `<div class="slot filled"><img src="${photos[i].url}" alt="${l}"><button class="x" data-rm="${i}" aria-label="Quitar ${l}">×</button></div>`
        : `<button class="slot" data-pick="${i}">+ ${l}</button>`).join("");
      q(".go").disabled = !photos.some(Boolean);
    };
    draw();
    const done = v => { photos.forEach(p => p && URL.revokeObjectURL(p.url)); host.innerHTML = ""; resolve(v); };
    q(".to-set")?.addEventListener("click", () => { done(null); showTab("set"); });
    q(".cancel").onclick = () => { ctl?.abort(); done(null); };
    q(".manual").onclick = () => done({ manual: true, product: { nombre: "", codigo_barras: code, tipo: "solido", edulcorantes: false, cafeina: false }, thumb: null });
    if (!hasKey) return;
    q(".slots").onclick = async e => {
      const pk = e.target.closest("[data-pick]"), rm = e.target.closest("[data-rm]");
      if (rm) { const i = +rm.dataset.rm; URL.revokeObjectURL(photos[i].url); photos[i] = null; draw(); }
      if (pk) { const i = +pk.dataset.pick, f = await filePick(); if (!f) return;
        const im = await loadImg(f).catch(() => null); const blob = im ? await shrink(im, 1568) : f;
        photos[i] = { blob, url: URL.createObjectURL(blob) }; draw(); }
    };
    q(".go").onclick = async () => {
      if (ctl) { ctl.abort(); return; }
      ctl = new AbortController(); q(".go").textContent = "Detener"; st.textContent = "Leyendo la etiqueta… (10 a 30 segundos)";
      try {
        const data = await readLabel(photos.filter(Boolean).map(p => p.blob), ctl.signal);
        if (data.legible === false && data.kcal == null) { st.textContent = data.nota || "No pude leer la etiqueta. Toma la tabla más de cerca."; return; }
        if (code) data.codigo_barras = code; else if (data.codigo_barras) data.codigo_barras = normCode(data.codigo_barras);
        data.fuente = "etiqueta";
        const thumb = await thumbOf(photos[2]?.blob || photos.find(Boolean).blob).catch(() => null);
        done({ product: data, thumb, note: data.nota });
      } catch (e) {
        const m = { cancelled: "Detenido.", no_key: "Falta tu clave de la API en Ajustes.", bad_key: "Tu clave de la API no es válida. Revísala en Ajustes.",
          rate_limited: "Demasiadas solicitudes o sin saldo en tu cuenta de la API. Espera un momento.", refused: "No se pudo analizar estas fotos.",
          offline: "Sin conexión. Para leer etiquetas necesitas internet.", invalid_json: "No pude interpretar la etiqueta; intenta con fotos más claras." };
        st.textContent = m[e?.code] || "Hubo un error con la API: " + (e?.message || "intenta de nuevo.");
      } finally { ctl = null; const g = q(".go"); if (g) g.textContent = "Analizar"; }
    };
  });
}

/* =========================================================
   Result view
   ========================================================= */
const verdict = s => s == null ? ["Sin datos", "var(--muted)"] : s >= 75 ? ["Excelente", "var(--good)"] : s >= 50 ? ["Bueno", "var(--ok)"] : s >= 25 ? ["Regular", "var(--warn)"] : ["Malo", "var(--bad)"];
const riskColor = r => r === "alto" ? "var(--bad)" : r === "moderado" ? "var(--warn)" : "var(--good)";
function sealSVG(label) {
  const t = ["EXCESO", ...label.toUpperCase().split(" ")], y0 = 47 - (t.length - 1) * 7;
  return `<svg viewBox="0 0 100 100" role="img" aria-label="Exceso ${esc(label)}">
    <polygon points="29,1 71,1 99,29 99,71 71,99 29,99 1,71 1,29" fill="#000"/>
    <polygon points="31,5 69,5 95,31 95,69 69,95 31,95 5,69 5,31" fill="none" stroke="#fff" stroke-width="1.5"/>
    ${t.map((w, i) => `<text x="50" y="${y0 + i * 14}" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-family="Arial Narrow,Arial,sans-serif" font-weight="700" font-size="${i ? (w.length > 9 ? 10.5 : 12.5) : 13}">${esc(w)}</text>`).join("")}
    <text x="50" y="84" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif" font-size="5.2">SECRETARÍA DE SALUD</text></svg>`;
}
const NUTR = [["kcal", "Energía", "kcal", 0], ["azucares_totales", "Azúcares totales", "g", 1], ["azucares_anadidos", "Azúcares añadidos", "g", 1],
  ["grasa_saturada", "Grasa saturada", "g", 1], ["grasa_trans", "Grasa trans", "g", 1], ["sodio_mg", "Sodio", "mg", 0], ["fibra", "Fibra", "g", 1], ["proteina", "Proteína", "g", 1]];
let current = null;

async function showProduct(c) {
  current = c;
  // products from Open Food Facts go to history as soon as they're viewed
  if (!c.example && !c.docId && c.product.fuente === "off") c.docId = await save(c.product, c.thumb, null);
  renderResult();
}
function renderResult() {
  const box = $("#result");
  if (!current) { box.innerHTML = ""; return; }
  const p = current.product, r = compute(p), [vw, vc] = verdict(r.score), unit = p.tipo === "liquido" ? "100 ml" : "100 g", ed = current.editing;
  const band = r.score == null ? -1 : r.score >= 75 ? 3 : r.score >= 50 ? 2 : r.score >= 25 ? 1 : 0;
  const alts = ed || current.example ? [] : alternatives(p);
  const src = current.example ? "" : p.fuente === "off" ? "Datos de Open Food Facts." : p.fuente === "etiqueta" ? "Datos leídos de tu etiqueta." : "Datos capturados por ti.";
  box.innerHTML = `<article class="res" aria-live="polite">
    <hr>
    ${current.example ? `<div class="msg small">Ejemplo. Escanea un producto para ver el tuyo.</div>` : ""}
    ${ed && current.manual ? `<div style="display:flex;flex-direction:column;gap:6px"><label class="label" for="in-name">Nombre</label><input id="in-name" class="field" value="${esc(p.nombre || "")}" placeholder="Ej. Galletas de avena">
      <label class="label" for="in-ingr">Ingredientes (opcional)</label><textarea id="in-ingr" class="field" rows="3">${esc(p.ingredientes || "")}</textarea></div>` : ""}
    <div class="res-head">
      <div style="min-width:0;display:flex;gap:12px;align-items:flex-start">
        ${p.imagen && navigator.onLine ? `<img src="${esc(p.imagen)}" alt="" style="width:56px;height:56px;object-fit:contain;background:#fff;flex:none">` : ""}
        <div style="min-width:0"><h2>${esc(p.nombre || "Producto sin nombre")}</h2>
        <div class="small muted">${esc([p.marca, p.contenido].filter(Boolean).join(" · "))}</div>
        ${p.codigo_barras ? `<div class="small muted code">${esc(p.codigo_barras)}</div>` : ""}</div>
      </div>
      <div class="score"><b style="color:${vc}">${r.score ?? "?"}</b><span style="color:${vc}">${vw}</span></div>
    </div>
    <div class="scale" aria-hidden="true">${["var(--bad)", "var(--warn)", "var(--ok)", "var(--good)"].map((c, i) => `<i style="${i === band ? "background:" + c : ""}"></i>`).join("")}</div>
    ${src ? `<div class="src">${src}</div>` : ""}
    ${r.incomplete ? `<div class="msg">A este producto le faltan datos de la tabla nutrimental, así que no se puede calificar. <button class="link" id="complete">Tomar fotos de la etiqueta para completarlo</button></div>`
      : r.partial ? `<div class="msg small">Datos parciales: falta un valor de la tabla, la calificación puede ser más alta de lo real. <button class="link small" id="complete">Completar con fotos</button></div>` : ""}
    <div style="display:flex;flex-direction:column;gap:8px">
      <div class="label">Sellos</div>
      ${r.seals.length ? `<div class="seals">${r.seals.map(s => `<div class="seal">${sealSVG(s)}</div>`).join("")}</div>` : r.incomplete ? `<div class="muted small">Sin datos suficientes.</div>` : `<div style="color:var(--good);font-weight:700">Sin sellos de exceso.</div>`}
      ${r.legends.map(l => `<div class="legend">${esc(l)}</div>`).join("")}
      ${r.sugUsesTotal && !r.incomplete ? `<p class="small muted" style="margin:0">Sin dato de azúcares añadidos; se usaron los totales.</p>` : ""}
    </div>
    ${alts.length ? `<div><div class="label" style="margin-bottom:2px">Mejores opciones parecidas</div>${alts.map(a => { const [, c] = verdict(a[3]);
      return `<button class="alt" data-code="${esc(a[0])}"><span style="min-width:0"><b>${esc(a[1])}</b><span>${esc(a[2] || "")}${a[2] ? " · " : ""}${a[4]} sellos</span></span><span class="n" style="color:${c}">${a[3]}</span></button>`; }).join("")}</div>` : ""}
    ${p.consejo ? `<p style="margin:0"><b>Mejor opción:</b> ${esc(p.consejo)}</p>` : ""}
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center"><span class="label">Por ${unit}</span>
        <button class="link small" id="edit">${ed ? "Cancelar" : "Corregir datos"}</button></div>
      <table><tbody>
      ${NUTR.map(([k, l, u, d]) => `<tr><td>${l}</td><td class="v">${ed ? `<input id="in-${k}" inputmode="decimal" value="${p[k] ?? ""}" aria-label="${l}"> ${u}` : `${fmt(num(p[k]), d)}${num(p[k]) == null ? "" : " " + u}`}</td></tr>`).join("")}
      ${ed ? `<tr><td>Tipo</td><td class="v"><select id="in-tipo" aria-label="Tipo"><option value="solido"${p.tipo !== "liquido" ? " selected" : ""}>Sólido</option><option value="liquido"${p.tipo === "liquido" ? " selected" : ""}>Líquido</option></select></td></tr>
      <tr><td><label for="in-edul">Contiene edulcorantes</label></td><td class="v"><input type="checkbox" id="in-edul" ${p.edulcorantes ? "checked" : ""} style="width:auto"></td></tr>
      <tr><td><label for="in-caf">Contiene cafeína</label></td><td class="v"><input type="checkbox" id="in-caf" ${p.cafeina ? "checked" : ""} style="width:auto"></td></tr>` : ""}
      </tbody></table>
      ${ed ? `<button class="btn" id="apply" style="margin-top:10px;width:100%">Guardar y recalcular</button>` : ""}
    </div>
    <div>
      <div class="label" style="margin-bottom:2px">Aditivos de riesgo (${r.adds.length})</div>
      ${r.adds.length ? r.adds.map(a => `<div class="add"><div style="min-width:0"><b>${esc(a.n)}</b><p>${esc(a.w)}</p></div><span class="risk" style="color:${riskColor(a.r)}">${a.r}</span></div>`).join("") : `<p class="small muted" style="margin:0">${p.ingredientes ? "Ninguno de la lista vigilada." : "Sin lista de ingredientes."}</p>`}
    </div>
    ${p.ingredientes ? `<details><summary>Ingredientes</summary><p>${esc(p.ingredientes)}</p></details>` : ""}
    <details><summary>Cómo se calculó</summary><ul><li>Base 100</li>${r.factors.map(f => `<li>${esc(f)}</li>`).join("")}</ul></details>
    ${current.example ? "" : `<button class="btn line" id="to-cmp" style="width:100%">Comparar con otro producto</button>`}
  </article>`;
  $("#edit").onclick = () => { current.editing = !current.editing; renderResult(); };
  if (ed) $("#apply").onclick = async () => {
    for (const [k] of NUTR) { const v = $("#in-" + k).value.trim(); p[k] = v === "" ? null : num(v); }
    p.tipo = $("#in-tipo").value; p.edulcorantes = $("#in-edul").checked; p.cafeina = $("#in-caf").checked;
    if (current.manual) { p.nombre = $("#in-name").value.trim() || "Producto"; p.ingredientes = $("#in-ingr").value.trim() || null; }
    if (p.fuente !== "etiqueta") p.fuente = "usuario";
    current.editing = false; current.example = false; current.manual = false;
    current.docId = await save(p, current.thumb, current.docId); renderResult();
  };
  const tc = $("#to-cmp"); if (tc) tc.onclick = () => { cmp[0] = { product: current.product }; cmp[1] = null; showTab("cmp"); };
  const cp = $("#complete"); if (cp) cp.onclick = async () => {
    const got = await captureLabel($("#scan-cap"), { code: p.codigo_barras, title: "Completar " + (p.nombre || "producto") });
    if (got) showCaptured(got, p);
  };
  box.querySelectorAll(".alt").forEach(b => b.onclick = async () => { await openCode(b.dataset.code); scrollTo({ top: 0, behavior: "smooth" }); });
}

/* =========================================================
   Scan flow
   ========================================================= */
async function openCode(code, msgEl = $("#scan-msg")) {
  const f = await findAny(code, msgEl); if (!f) return false;
  $("#scan-cap").innerHTML = ""; msgEl.innerHTML = "";
  await showProduct(f); return true;
}
async function handleCode(code) {
  if (!code) return;
  showTab("scan");
  if (await openCode(code)) return;
  current = null; renderResult();
  showCaptured(await captureLabel($("#scan-cap"), { code }));
}
$("#scan-btn").onclick = async () => { $("#scan-msg").innerHTML = ""; handleCode(await openScanner()); };
$("#code-form").onsubmit = e => {
  e.preventDefault(); const c = normCode($("#code-in").value);
  if (c.length < 8) { $("#scan-msg").innerHTML = `<div class="msg err">Escribe los 8 o 13 dígitos del código.</div>`; return; }
  $("#code-in").value = ""; $("#code-in").blur(); handleCode(c);
};
$("#nocode").onclick = async () => { current = null; renderResult(); showCaptured(await captureLabel($("#scan-cap"), { title: "Analizar etiqueta" })); };
async function showCaptured(got, base) {
  if (!got) return;
  if (base && !got.manual) got.product = { ...base, ...Object.fromEntries(Object.entries(got.product).filter(([, v]) => v != null && v !== "")), cat: base.cat, fuente: "etiqueta" };
  current = { product: got.product, thumb: got.thumb, docId: findKnown(normCode(got.product.codigo_barras))?.id || null, editing: !!got.manual, manual: !!got.manual };
  if (got.note) $("#scan-msg").innerHTML = `<div class="msg small">Nota: ${esc(got.note)}</div>`;
  if (!got.manual) current.docId = await save(current.product, current.thumb, current.docId);
  renderResult(); $("#result").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* =========================================================
   Compare
   ========================================================= */
const cmp = [null, null], cmpQuery = ["", ""];
function searchAll(q) {
  const t = norm(q).split(/\s+/).filter(Boolean); if (!t.length) return [];
  const out = [], seen = new Set();
  for (const h of history) { const s = norm((h.product?.nombre || "") + " " + (h.product?.marca || ""));
    if (t.every(w => s.includes(w))) { out.push({ code: h.barcode, id: h.id, name: h.product?.nombre, brand: h.product?.marca, score: h.score, mine: true }); if (h.barcode) seen.add(h.barcode); } }
  if (INDEX) for (const r of INDEX) { if (out.length >= 40) break; if (seen.has(r[0])) continue; const s = norm(r[1] + " " + (r[2] || ""));
    if (t.every(w => s.includes(w))) out.push({ code: r[0], name: r[1], brand: r[2], score: r[3] }); }
  return out.slice(0, 40);
}
function renderCmp() {
  const sc = cmp.map(c => c ? compute(c.product).score : null);
  const win = sc[0] != null && sc[1] != null && sc[0] !== sc[1] ? (sc[0] > sc[1] ? 0 : 1) : -1;
  $("#cmp-cols").innerHTML = [0, 1].map(i => {
    const c = cmp[i];
    if (!c) return `<div class="cmp-col"><span class="label">Producto ${i ? "B" : "A"}</span>
      <button class="btn y" data-scan="${i}">Escanear</button>
      <div><input class="field" data-q="${i}" placeholder="o busca" value="${esc(cmpQuery[i])}" aria-label="Buscar producto ${i ? "B" : "A"}"><div class="hits" data-hits="${i}"></div></div></div>`;
    const [vw, vc] = verdict(sc[i]);
    return `<div class="cmp-col${win === i ? " win" : ""}"><span class="label">${win === i ? "Mejor opción" : "Producto " + (i ? "B" : "A")}</span>
      <h3>${esc(c.product.nombre || "Producto")}</h3><div class="big" style="color:${vc}">${sc[i] ?? "?"}</div><span class="small" style="color:${vc};font-weight:700">${vw}</span>
      <button class="link small" data-clear="${i}" style="align-self:flex-start">Cambiar</button></div>`;
  }).join("");
  [0, 1].forEach(i => { if (!cmp[i] && cmpQuery[i]) drawHits(i); });
  if (cmp[0] && cmp[1]) {
    const [a, b] = cmp.map(c => c.product), ra = compute(a), rb = compute(b);
    const lower = { kcal: 1, azucares_totales: 1, azucares_anadidos: 1, grasa_saturada: 1, grasa_trans: 1, sodio_mg: 1, fibra: 0, proteina: 0 };
    const cell = (k, v, o, d) => { const x = num(v), y = num(o); const best = x != null && y != null && x !== y && (lower[k] ? x < y : x > y); return `<td class="v${best ? " best" : ""}">${fmt(x, d)}</td>`; };
    const cnt = (x, y) => `<td class="v${x < y ? " best" : ""}">${x}</td>`;
    $("#cmp-table").innerHTML = `${ra.score === rb.score && ra.score != null ? `<div class="msg small">Empate en calificación; revisa el detalle.</div>` : ""}
      <table><thead><tr><th>Por 100 g / ml</th><th class="v">A</th><th class="v">B</th></tr></thead><tbody>
      <tr><td>Sellos</td>${cnt(ra.seals.length, rb.seals.length)}${cnt(rb.seals.length, ra.seals.length)}</tr>
      <tr><td>Aditivos de riesgo</td>${cnt(ra.adds.length, rb.adds.length)}${cnt(rb.adds.length, ra.adds.length)}</tr>
      ${NUTR.map(([k, l, u, d]) => `<tr><td>${l} <span class="muted small">${u}</span></td>${cell(k, a[k], b[k], d)}${cell(k, b[k], a[k], d)}</tr>`).join("")}
      </tbody></table>${a.tipo !== b.tipo ? `<p class="small muted" style="margin:6px 0 0">Uno es sólido (por 100 g) y otro líquido (por 100 ml).</p>` : ""}`;
  } else $("#cmp-table").innerHTML = "";
}
function drawHits(i) {
  const el = document.querySelector(`[data-hits="${i}"]`); if (!el) return;
  const res = searchAll(cmpQuery[i]);
  el.innerHTML = res.length ? res.map(h => { const [, c] = verdict(h.score);
    return `<button data-code="${esc(h.code || "")}" data-id="${esc(h.id || "")}"><span style="min-width:0"><b>${esc(h.name || "Producto")}</b><br><span>${esc(h.brand || "")}${h.mine ? " · tu historial" : ""}</span></span><b style="color:${c}">${h.score ?? "?"}</b></button>`; }).join("")
    : (cmpQuery[i].trim() ? `<button disabled><span class="muted">Sin resultados</span></button>` : "");
}
$("#cmp-cols").addEventListener("input", e => { const s = e.target.closest("[data-q]"); if (!s) return; cmpQuery[+s.dataset.q] = s.value; drawHits(+s.dataset.q); });
$("#cmp-cols").addEventListener("click", async e => {
  const cl = e.target.closest("[data-clear]"); if (cl) { cmp[+cl.dataset.clear] = null; cmpQuery[+cl.dataset.clear] = ""; renderCmp(); return; }
  const hit = e.target.closest("[data-hits] button[data-code]");
  if (hit) { const i = +hit.parentElement.dataset.hits;
    const h = hit.dataset.id && history.find(x => x.id === hit.dataset.id);
    const f = h ? { product: h.product } : await findAny(hit.dataset.code);
    if (f) { cmp[i] = { product: f.product }; cmpQuery[i] = ""; renderCmp(); } return; }
  const s = e.target.closest("[data-scan]"); if (!s) return;
  const i = +s.dataset.scan, host = $("#cmp-cap");
  const code = await openScanner(); if (!code) return;
  const f = await findAny(code, host);
  if (f) { cmp[i] = { product: f.product }; if (!f.docId && f.product.fuente === "off") save(f.product, null, null); renderCmp(); return; }
  const got = await captureLabel(host, { code, title: `Producto ${i ? "B" : "A"}` });
  if (!got) return;
  if (got.manual) { current = { product: got.product, thumb: null, docId: null, editing: true, manual: true }; showTab("scan"); renderResult(); return; }
  await save(got.product, got.thumb, null); cmp[i] = { product: got.product }; renderCmp();
});

/* =========================================================
   History
   ========================================================= */
function renderHistory() {
  const q = norm($("#q").value);
  const items = history.filter(h => !q || norm((h.product?.nombre || "") + " " + (h.product?.marca || "")).includes(q));
  const scored = history.filter(h => h.score != null), n = history.length;
  const avg = scored.length ? Math.round(scored.reduce((a, h) => a + h.score, 0) / scored.length) : null;
  const sug = n ? Math.round(100 * history.filter(h => (h.seals || []).some(s => norm(s) === "azucares")).length / n) : null;
  $("#stats").innerHTML = `<div><b>${n}</b><span>productos</span></div><div><b>${avg ?? "—"}</b><span>promedio</span></div><div><b>${sug == null ? "—" : sug + "%"}</b><span>con exceso de azúcares</span></div>`;
  $("#hist").innerHTML = items.length ? items.map(h => { const [, c] = verdict(h.score);
    return `<button class="hitem" data-id="${esc(h.id)}">${h.thumb ? `<img src="${esc(h.thumb)}" alt="">` : `<span class="ph">${(h.seals || []).length ? `<svg viewBox="0 0 100 100" width="26" height="26" aria-hidden="true"><polygon points="29,1 71,1 99,29 99,71 71,99 29,99 1,71 1,29" fill="var(--fg)"/></svg>` : ""}</span>`}
      <span class="t"><b>${esc(h.product?.nombre || "Producto")}</b><span>${esc(h.product?.marca || "")}${h.product?.marca ? " · " : ""}${(h.seals || []).length} sellos · ${new Date(h.ts).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}</span></span>
      <span class="s" style="color:${c}">${h.score ?? "?"}</span></button>`; }).join("")
    : `<p class="muted small">${n ? "Nada coincide." : "Aún no hay productos. Todo lo que escanees se guarda aquí, en tu teléfono."}</p>`;
  $("#hist-size").textContent = `${n} productos guardados en este teléfono.`;
}
$("#q").addEventListener("input", renderHistory);
$("#hist").addEventListener("click", e => {
  const b = e.target.closest("[data-id]"); if (!b) return; const h = history.find(x => x.id === b.dataset.id); if (!h) return;
  current = { product: structuredClone(h.product), docId: h.id, thumb: h.thumb }; showTab("scan"); renderResult(); scrollTo({ top: 0 });
});

/* =========================================================
   Settings
   ========================================================= */
function renderKeyState() {
  const k = apiKey();
  $("#key-state").textContent = k ? `Clave guardada (termina en …${k.slice(-4)}).` : "Sin clave: los productos que no estén en la base se capturan a mano.";
  $("#key-in").value = "";
}
$("#key-save").onclick = () => {
  const v = $("#key-in").value.trim();
  if (!v) { store.set("octagono.apikey", null); renderKeyState(); return; }
  if (!v.startsWith("sk-ant-")) { $("#key-state").textContent = "Esa clave no parece de Anthropic; debe empezar con sk-ant-."; return; }
  store.set("octagono.apikey", v); renderKeyState();
};
$("#export").onclick = () => {
  const blob = new Blob([JSON.stringify({ app: "octagono", version: 1, exported: new Date().toISOString(), products: history })], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `octagono-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  $("#backup-state").textContent = `Respaldo con ${history.length} productos descargado.`;
};
$("#import").onclick = () => $("#import-in").click();
$("#import-in").onchange = async () => {
  const f = $("#import-in").files[0]; if (!f) return;
  try {
    const j = JSON.parse(await f.text()); const list = Array.isArray(j) ? j : j.products;
    if (!Array.isArray(list)) throw 0;
    let n = 0;
    for (const d of list) { if (!d?.product) continue; const r = compute(d.product);
      await idb.put({ id: d.id || crypto.randomUUID(), product: d.product, score: r.score, seals: r.seals, thumb: d.thumb || null, barcode: normCode(d.product.codigo_barras) || null, ts: d.ts || Date.now() }); n++; }
    await loadHistory(); $("#backup-state").textContent = `Se importaron ${n} productos.`;
  } catch { $("#backup-state").textContent = "Ese archivo no es un respaldo de Octágono."; }
  $("#import-in").value = "";
};
let installEvt = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; $("#install").hidden = false; });
$("#install").onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; $("#install").hidden = true; };

/* =========================================================
   Tabs & boot
   ========================================================= */
function showTab(t) {
  for (const k of ["scan", "cmp", "hist", "set"]) { $("#view-" + k).hidden = k !== t; const tb = $("#tab-" + k); if (tb) tb.setAttribute("aria-selected", k === t); }
  if (t === "hist") renderHistory(); if (t === "cmp") renderCmp(); if (t === "set") { renderKeyState(); renderHistory(); }
}
for (const k of ["scan", "cmp", "hist"]) $("#tab-" + k).onclick = () => showTab(k);
$("#open-settings").onclick = () => showTab("set");
function refreshViews() { if (!$("#view-hist").hidden || !$("#view-set").hidden) renderHistory(); if (!$("#view-cmp").hidden) renderCmp(); }
$("#ver").textContent = "Versión " + VERSION + ".";

current = { example: true, product: { nombre: "Galletas con chispas de chocolate", marca: "Producto de ejemplo", contenido: "200 g", tipo: "solido",
  kcal: 485, azucares_totales: 30, azucares_anadidos: 28, grasa_saturada: 11, grasa_trans: 0.2, sodio_mg: 310, fibra: 2.1, proteina: 5.5,
  ingredientes: "Harina de trigo enriquecida, azúcar, aceite vegetal de palma, chispas de chocolate (azúcar, licor de cacao, manteca de cacao, lecitina de soya), jarabe de maíz de alta fructosa, sal, bicarbonato de sodio, saborizante artificial, color caramelo IV.",
  aditivos: [], edulcorantes: false, cafeina: false, tiene_azucar_anadido: true, tiene_sodio_anadido: true,
  consejo: "Galletas integrales de avena sin sellos, o fruta con un puñado de nueces." } };
renderResult();
loadHistory().then(() => { if (history.length && current?.example) { current = null; renderResult(); } });
loadIndex();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
// Test hook: lets automated checks run a lookup without a camera.
window.__octagono = { handleCode, history: () => history };
