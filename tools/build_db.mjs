// Builds db/index.json and db/s0..s9.json from the raw Open Food Facts download (tools/off_raw.jsonl).
// Usage: node tools/build_db.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compute, fromOFF, pack, normCode } from "../logic.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const raw = process.argv[2] || path.join(root, "tools", "off_raw.jsonl");
// Spanish/English texts fetched by off_latin.mjs for products whose dump text is in another alphabet
const latinFile = path.join(root, "tools", "off_latin.json");
const latinTexts = fs.existsSync(latinFile) ? JSON.parse(fs.readFileSync(latinFile, "utf8")) : {};
const best = new Map();
for (const line of fs.readFileSync(raw, "utf8").split("\n")) {
  if (!line.trim()) continue;
  for (const o of JSON.parse(line).products) {
    const p = fromOFF({ ...o, ...(latinTexts[normCode(o.code)] || {}) }); if (!p) continue;
    const filled = Object.values(p).filter(v => v != null && v !== "" && !(Array.isArray(v) && !v.length)).length;
    const prev = best.get(p.codigo_barras);
    if (!prev || filled > prev.filled) best.set(p.codigo_barras, { p, filled });
  }
}
fs.mkdirSync(path.join(root, "db"), { recursive: true });
const shards = Array.from({ length: 10 }, () => ({}));
const index = [];
let withNutr = 0;
for (const [code, { p }] of best) {
  shards[+code.slice(-1)][code] = pack(p);
  const r = compute(p); if (r.score != null) withNutr++;
  index.push([code, p.nombre, p.marca, r.score, r.seals.length, p.cat]);
}
index.sort((a, b) => a[1].localeCompare(b[1], "es"));
const date = new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
fs.writeFileSync(path.join(root, "db/index.json"), JSON.stringify({ meta: { date, count: index.length, withNutr }, rows: index }));
shards.forEach((s, i) => fs.writeFileSync(path.join(root, `db/s${i}.json`), JSON.stringify(s)));
console.log({ products: index.length, withNutr });
