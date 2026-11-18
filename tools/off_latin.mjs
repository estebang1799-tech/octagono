// For products in the raw download whose name or ingredients are in another alphabet (Cyrillic, etc.),
// ask the Open Food Facts product API for the Spanish or English fields. Writes tools/off_latin.json
// ({code: {product_name_es, product_name_en, ingredients_text_es, ingredients_text_en}}), which
// build_db.mjs merges in. Usage: node tools/off_spanish.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { foreignScript, normCode } from "../logic.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outFile = path.join(root, "tools", "off_latin.json");
const done = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, "utf8")) : {};
const todo = new Set();
for (const line of fs.readFileSync(path.join(root, "tools", "off_raw.jsonl"), "utf8").split("\n")) {
  if (!line.trim()) continue;
  for (const p of JSON.parse(line).products) {
    const code = normCode(p.code);
    if (code && !(code in done) && (foreignScript(p.product_name) || foreignScript(p.ingredients_text))) todo.add(code);
  }
}
console.log("to fetch", todo.size);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FIELDS = "product_name_es,product_name_en,generic_name_es,ingredients_text_es,ingredients_text_en";
let n = 0;
for (const code of todo) {
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`,
      { headers: { "User-Agent": "PersonalFoodApp/1.0 (personal use)" } });
    if (r.ok) done[code] = (await r.json()).product || {};
  } catch { /* skipped; picked up on the next run */ }
  if (++n % 25 === 0) { fs.writeFileSync(outFile, JSON.stringify(done)); console.log(n, "fetched"); }
  await sleep(700); // stays under the API's 100 requests/minute
}
fs.writeFileSync(outFile, JSON.stringify(done));
console.log("DONE", Object.keys(done).length);
