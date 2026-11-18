// Shared scoring and data logic. Used by the app (browser) and by tools/build_db.mjs (Node).

export const num = v => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
export const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export const normCode = c => { const d = String(c || "").replace(/\D/g, ""); return d.length === 12 ? "0" + d : d; };

export const ADDITIVES = [
  { k: ["e250", "nitrito de sodio", "nitrito sodico"], n: "Nitrito de sodio (E250)", r: "alto", w: "Conservador de carnes frías; forma nitrosaminas." },
  { k: ["e251", "e252", "nitrato de sodio", "nitrato de potasio"], n: "Nitratos (E251/E252)", r: "alto", w: "Conservador de embutidos; se convierte en nitritos." },
  { k: ["e320", "butilhidroxianisol"], n: "BHA (E320)", r: "alto", w: "Antioxidante sintético; posible cancerígeno (IARC 2B)." },
  { k: ["e321", "butilhidroxitolueno"], n: "BHT (E321)", r: "moderado", w: "Antioxidante sintético; evidencia mixta." },
  { k: ["e171", "dioxido de titanio"], n: "Dióxido de titanio (E171)", r: "alto", w: "Prohibido en la Unión Europea desde 2022." },
  { k: ["bromato de potasio", "e924"], n: "Bromato de potasio", r: "alto", w: "Mejorador de harina; posible cancerígeno." },
  { k: ["parcialmente hidrogenad"], n: "Aceite parcialmente hidrogenado", r: "alto", w: "Fuente de grasas trans." },
  { k: ["e951", "aspartame", "aspartamo"], n: "Aspartame (E951)", r: "moderado", w: "Edulcorante; posible cancerígeno (IARC 2B, 2023)." },
  { k: ["e950", "acesulfame"], n: "Acesulfame K (E950)", r: "moderado", w: "Edulcorante artificial." },
  { k: ["e955", "sucralosa"], n: "Sucralosa (E955)", r: "moderado", w: "Edulcorante; posibles efectos en la microbiota." },
  { k: ["e954", "sacarina"], n: "Sacarina (E954)", r: "moderado", w: "Edulcorante artificial." },
  { k: ["e102", "tartrazina", "amarillo 5", "amarillo no. 5", "amarillo #5"], n: "Tartrazina / Amarillo 5 (E102)", r: "alto", w: "Colorante azoico; asociado a hiperactividad en niños." },
  { k: ["e110", "amarillo ocaso", "amarillo 6", "amarillo no. 6", "amarillo #6"], n: "Amarillo 6 (E110)", r: "alto", w: "Colorante azoico; asociado a hiperactividad en niños." },
  { k: ["e129", "rojo allura", "rojo 40", "rojo no. 40", "rojo #40"], n: "Rojo 40 (E129)", r: "alto", w: "Colorante azoico; asociado a hiperactividad en niños." },
  { k: ["e122", "azorrubina", "carmoisina"], n: "Azorrubina (E122)", r: "alto", w: "Colorante azoico." },
  { k: ["e124", "ponceau"], n: "Ponceau 4R (E124)", r: "alto", w: "Colorante azoico." },
  { k: ["e133", "azul brillante", "azul 1", "azul no. 1"], n: "Azul 1 (E133)", r: "moderado", w: "Colorante sintético." },
  { k: ["e150d", "caramelo iv", "caramelo clase iv", "sulfito amonico"], n: "Caramelo IV (E150d)", r: "moderado", w: "Puede contener 4-MEI." },
  { k: ["e211", "benzoato de sodio"], n: "Benzoato de sodio (E211)", r: "moderado", w: "Con vitamina C puede formar benceno." },
  { k: ["e621", "glutamato monosodico"], n: "Glutamato monosódico (E621)", r: "bajo", w: "Potenciador de sabor." },
  { k: ["e407", "carragenina", "carragenano"], n: "Carragenina (E407)", r: "moderado", w: "Espesante; posible inflamación intestinal." },
  { k: ["e433", "polisorbato 80"], n: "Polisorbato 80 (E433)", r: "moderado", w: "Emulsificante; posible efecto en la microbiota." },
  { k: ["e466", "carboximetilcelulosa", "carboximetil celulosa"], n: "Carboximetilcelulosa (E466)", r: "moderado", w: "Emulsificante; posible efecto en la microbiota." },
  { k: ["e450", "e451", "e452", "pirofosfato", "trifosfato", "polifosfato"], n: "Fosfatos (E450–E452)", r: "moderado", w: "Exceso de fósforo." },
  { k: ["e338", "acido fosforico"], n: "Ácido fosfórico (E338)", r: "moderado", w: "Típico de refrescos de cola." },
  { k: ["alta fructosa", "jmaf"], n: "Jarabe de maíz de alta fructosa", r: "moderado", w: "Azúcar añadido muy procesado." },
  { k: ["e202", "sorbato de potasio"], n: "Sorbato de potasio (E202)", r: "bajo", w: "Conservador de bajo riesgo." },
];

export function findAdditives(ingr, extra) {
  const h = " " + norm([ingr, ...(extra || [])].join(" | ")) + " ";
  return ADDITIVES.filter(a => a.k.some(k => /^e\d/.test(k) ? new RegExp("\\b" + k + "(?![0-9])").test(h) : h.includes(norm(k))));
}

/** NOM-051 phase 3 warning seals (per 100 g / 100 ml) plus Octágono's own 0–100 score. */
export function compute(p) {
  const liquid = p.tipo === "liquido";
  const kcal = num(p.kcal), sug = num(p.azucares_anadidos) ?? num(p.azucares_totales),
    sat = num(p.grasa_saturada), trans = num(p.grasa_trans), na = num(p.sodio_mg), fib = num(p.fibra), prot = num(p.proteina);
  const sugUsesTotal = num(p.azucares_anadidos) == null && num(p.azucares_totales) != null;
  // sugar, saturated fat and sodium drive most seals: without them a score would look better than the product is
  const missingKey = [sug, sat, na].filter(v => v == null).length;
  const incomplete = kcal == null || missingKey >= 2;
  const partial = !incomplete && missingKey === 1;
  // seals[i] is the seal name; ratio[name] is how many times over the NOM-051 limit the product is
  const seals = [], ratio = {};
  const add = (name, r) => { seals.push(name); ratio[name] = r; };
  if (kcal != null) {
    if (!liquid && kcal >= 275) add("calorías", kcal / 275);
    else if (liquid && (kcal >= 70 || (sug != null && sug * 4 >= 8))) add("calorías", Math.max(kcal / 70, sug != null ? sug * 4 / 8 : 0));
  }
  if (kcal && sug != null && p.tiene_azucar_anadido !== false && sug * 4 / kcal >= 0.10) add("azúcares", sug * 4 / kcal / 0.10);
  if (kcal && sat != null && sat * 9 / kcal >= 0.10) add("grasas saturadas", sat * 9 / kcal / 0.10);
  if (kcal && trans != null && trans * 9 / kcal >= 0.01) add("grasas trans", trans * 9 / kcal / 0.01);
  if (na != null && p.tiene_sodio_anadido !== false) {
    if (liquid && (kcal ?? 0) < 1) { if (na >= 45) add("sodio", na / 45); }
    else if ((kcal && na / kcal >= 1) || na >= 300) add("sodio", Math.max(kcal ? na / kcal : 0, na / 300));
  }
  const legends = [];
  if (p.edulcorantes) legends.push("Contiene edulcorantes, no recomendable en niños");
  if (p.cafeina) legends.push("Contiene cafeína, evitar en niños");
  const adds = findAdditives(p.ingredientes, p.aditivos);
  const pen = { "calorías": 12, "azúcares": 18, "grasas saturadas": 14, "grasas trans": 20, "sodio": 14 };
  const factors = []; let s = 100;
  for (const k of seals) {
    // base penalty per seal, plus up to 12 more the further the product is over the limit
    const extra = Math.min(12, Math.round((ratio[k] - 1) * 6)), total = pen[k] + extra;
    s -= total; factors.push(`−${total} exceso ${k}` + (ratio[k] >= 1.5 ? ` (${ratio[k].toFixed(1).replace(".", ",")} veces el límite)` : ""));
  }
  if (p.edulcorantes) { s -= 8; factors.push("−8 edulcorantes"); }
  const ap = Math.min(30, adds.reduce((a, x) => a + (x.r === "alto" ? 10 : x.r === "moderado" ? 4 : 0), 0));
  if (ap) { s -= ap; factors.push(`−${ap} aditivos de riesgo`); }
  if (fib != null && fib >= 6) { s += 6; factors.push("+6 alto en fibra"); } else if (fib != null && fib >= 3) { s += 3; factors.push("+3 fuente de fibra"); }
  if (prot != null && prot >= 10) { s += 4; factors.push("+4 alto en proteína"); }
  return { seals, legends, adds, factors, sugUsesTotal, incomplete, partial, score: incomplete ? null : Math.max(0, Math.min(100, Math.round(s))) };
}

/* ---------- Open Food Facts → product ---------- */
export const OFF_FIELDS = ["code", "product_name_es", "product_name", "brands", "quantity", "nutriments",
  "ingredients_text_es", "ingredients_text", "additives_tags", "categories_tags"].join(",");
const r1 = v => v == null || v === "" || !Number.isFinite(+v) ? null : Math.round(+v * 10) / 10;
const SUGAR = /az[uú]car|jarabe|sacarosa|glucosa|fructosa|dextrosa|miel|piloncillo|maltodextrina|melaza|concentrado de jugo/i;
const SALT = /\bsal\b|sal yodada|sodio|glutamato|salmuera/i;
const SWEET = /sucralosa|aspartam|acesulfam|sacarina|stevia|estevia|esteviol|ciclamato|neotamo|advantamo|fruta del monje/i;
const SWEET_E = /^(e950|e951|e952|e954|e955|e960|e961|e962|e969)/;
const CAF = /cafe[ií]na|\bcaf[eé]\b|guaran[aá]|t[eé] (negro|verde)|yerba mate/i;
const clean = s => s == null ? null : String(s).replace(/�/g, "").replace(/_/g, "").replace(/\s+/g, " ").trim() || null;

export function fromOFF(p) {
  const code = normCode(p.code);
  const name = clean(p.product_name_es) || clean(p.product_name);
  if (!code || code.length < 8 || !name) return null;
  const n = p.nutriments || {};
  const ingr = clean(p.ingredients_text_es) || clean(p.ingredients_text);
  const adds = (p.additives_tags || []).map(t => t.replace(/^en:/, "")).filter(Boolean);
  const cats = p.categories_tags || [];
  const qty = clean(p.quantity);
  const liquid = /\d\s*(ml|cl|l|lt|litros?)\b/i.test(qty || "") || cats.includes("en:beverages");
  let na = n.sodium_100g != null && n.sodium_100g !== "" ? +n.sodium_100g * 1000 : n.salt_100g != null && n.salt_100g !== "" ? +n.salt_100g / 2.5 * 1000 : null;
  if (na != null && Number.isFinite(na)) na = Math.round(na); else na = null;
  const kcalRaw = n["energy-kcal_100g"] ?? (n.energy_100g != null ? +n.energy_100g / 4.184 : null);
  const kcal = kcalRaw != null && kcalRaw !== "" && Number.isFinite(+kcalRaw) ? Math.round(+kcalRaw) : null;
  return {
    codigo_barras: code, nombre: name, marca: clean((p.brands || "").split(",")[0]), contenido: qty, tipo: liquid ? "liquido" : "solido",
    kcal, azucares_totales: r1(n.sugars_100g), azucares_anadidos: r1(n["added-sugars_100g"]), grasa_saturada: r1(n["saturated-fat_100g"]),
    grasa_trans: r1(n["trans-fat_100g"]), sodio_mg: na, fibra: r1(n.fiber_100g), proteina: r1(n.proteins_100g),
    ingredientes: ingr ? ingr.slice(0, 1200) : null, aditivos: adds,
    edulcorantes: !!((ingr && SWEET.test(ingr)) || adds.some(a => SWEET_E.test(a))),
    cafeina: !!(ingr && CAF.test(ingr)),
    tiene_azucar_anadido: n["added-sugars_100g"] != null && n["added-sugars_100g"] !== "" ? +n["added-sugars_100g"] > 0 : ingr ? SUGAR.test(ingr) : true,
    tiene_sodio_anadido: ingr ? SALT.test(ingr) : true,
    cat: cats.length ? cats[cats.length - 1].replace(/^[a-z]{2}:/, "") : null,
    fuente: "off",
  };
}

/* Compact rows for the bundled database */
const KEYS = ["nombre", "marca", "contenido", "tipo", "kcal", "azucares_totales", "azucares_anadidos", "grasa_saturada", "grasa_trans",
  "sodio_mg", "fibra", "proteina", "ingredientes", "aditivos", "edulcorantes", "cafeina", "tiene_azucar_anadido", "tiene_sodio_anadido", "cat"];
export function pack(p) {
  return KEYS.map(k => k === "aditivos" ? (p.aditivos?.length ? p.aditivos.join(" ") : null)
    : typeof p[k] === "boolean" ? (p[k] ? 1 : 0) : p[k] ?? null);
}
export function unpack(code, row) {
  const p = { codigo_barras: code, fuente: "off" };
  KEYS.forEach((k, i) => {
    const v = row[i];
    if (k === "aditivos") p[k] = v ? v.split(" ") : [];
    else if (["edulcorantes", "cafeina", "tiene_azucar_anadido", "tiene_sodio_anadido"].includes(k)) p[k] = v === 1;
    else p[k] = v;
  });
  return p;
}
