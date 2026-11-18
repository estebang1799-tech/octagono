// Plain-language explanations of common ingredients, used offline (no API key needed).
// Each entry: k = words to recognize (Spanish/English, accents removed), t = kind, d = what it is / what it's for,
// ojo = worth limiting.
import { norm, ADDITIVES } from "./logic.js";

export const KINDS = {
  azucar: "Azúcar", edulcorante: "Edulcorante", grasa: "Grasa o aceite", cereal: "Harina o cereal", lacteo: "Lácteo",
  proteina: "Proteína", fruta: "Fruta o verdura", sal: "Sal", agua: "Agua", aditivo: "Aditivo", sabor: "Saborizante",
  vitamina: "Vitamina o mineral", otro: "Otro",
};

const DICT = [
  // sugars
  { k: ["azucar", "sugar", "sacarosa", "sucrose", "azucar refinada", "cane sugar"], t: "azucar", d: "Azúcar de mesa. Endulza y aporta calorías sin otros nutrientes.", ojo: true },
  { k: ["jarabe de maiz de alta fructosa", "high fructose corn syrup", "jmaf"], t: "azucar", d: "Azúcar líquida hecha de maíz, muy procesada y barata. Se asocia a más grasa en el hígado.", ojo: true },
  { k: ["jarabe de maiz", "corn syrup", "jarabe de glucosa", "glucose syrup", "jarabe", "syrup"], t: "azucar", d: "Azúcar líquida. Endulza y da textura; cuenta como azúcar añadida.", ojo: true },
  { k: ["glucosa", "glucose", "dextrosa", "dextrose", "fructosa", "fructose"], t: "azucar", d: "Tipo de azúcar simple que se absorbe rápido.", ojo: true },
  { k: ["maltodextrina", "maltodextrin"], t: "azucar", d: "Carbohidrato hecho de almidón; sube el azúcar en sangre casi como el azúcar.", ojo: true },
  { k: ["miel", "honey"], t: "azucar", d: "Endulzante natural, pero para el cuerpo cuenta como azúcar añadida.", ojo: true },
  { k: ["piloncillo", "panela", "melaza", "molasses", "azucar mascabado", "brown sugar"], t: "azucar", d: "Azúcar menos refinada; aun así es azúcar añadida.", ojo: true },
  { k: ["concentrado de jugo", "juice concentrate", "jugo concentrado"], t: "azucar", d: "Jugo de fruta sin agua. Se usa para endulzar y cuenta como azúcar libre.", ojo: true },
  // sweeteners
  { k: ["sucralosa", "sucralose"], t: "edulcorante", d: "Edulcorante artificial sin calorías, unas 600 veces más dulce que el azúcar.", ojo: true },
  { k: ["aspartame", "aspartamo"], t: "edulcorante", d: "Edulcorante artificial sin calorías. La OMS (IARC) lo clasificó como posible cancerígeno en 2023.", ojo: true },
  { k: ["acesulfame"], t: "edulcorante", d: "Edulcorante artificial sin calorías; suele combinarse con otros.", ojo: true },
  { k: ["stevia", "estevia", "glucosidos de esteviol", "steviol"], t: "edulcorante", d: "Edulcorante sin calorías que viene de una planta; no se recomienda en niños.", ojo: false },
  { k: ["eritritol", "erythritol", "xilitol", "xylitol", "sorbitol", "maltitol"], t: "edulcorante", d: "Polialcohol: endulza con pocas calorías; en exceso puede causar molestias digestivas.", ojo: false },
  // fats
  { k: ["aceite de palma", "palm oil", "grasa de palma", "oleina de palma", "palmiste", "palm kernel"], t: "grasa", d: "Aceite barato y sólido a temperatura ambiente, alto en grasa saturada.", ojo: true },
  { k: ["parcialmente hidrogenad", "partially hydrogenated"], t: "grasa", d: "Grasa procesada que contiene grasas trans, las más dañinas para el corazón.", ojo: true },
  { k: ["manteca vegetal", "shortening", "grasa vegetal"], t: "grasa", d: "Grasa sólida para dar textura crujiente o suave; suele ser alta en grasa saturada.", ojo: true },
  { k: ["aceite de canola", "canola oil", "aceite de girasol", "sunflower oil", "aceite de soya", "soybean oil", "aceite vegetal", "vegetal oil", "vegetable oil", "aceite de maiz", "corn oil", "aceite de cartamo"], t: "grasa", d: "Aceite vegetal líquido; aporta grasa y calorías.", ojo: false },
  { k: ["aceite de oliva", "olive oil", "aguacate", "avocado"], t: "grasa", d: "Grasa de buena calidad, rica en grasas insaturadas.", ojo: false },
  { k: ["mantequilla", "butter", "crema", "cream", "manteca"], t: "grasa", d: "Grasa de origen animal o lácteo, alta en grasa saturada.", ojo: true },
  { k: ["manteca de cacao", "cocoa butter"], t: "grasa", d: "Grasa natural del cacao; da la textura al chocolate.", ojo: false },
  // cereals
  { k: ["harina de trigo integral", "whole wheat flour", "trigo integral", "avena", "oat", "salvado", "bran", "integral", "whole grain", "grano entero", "granos enteros", "cereal integral"], t: "cereal", d: "Cereal integral: conserva la fibra y es la mejor opción entre las harinas.", ojo: false },
  { k: ["harina de trigo", "wheat flour", "harina refinada", "harina enriquecida", "enriched flour", "flour", "harina"], t: "cereal", d: "Harina refinada: perdió casi toda la fibra; se digiere rápido.", ojo: false },
  { k: ["almidon", "starch", "fecula"], t: "cereal", d: "Almidón: espesa y da cuerpo; es carbohidrato sin fibra.", ojo: false },
  { k: ["maiz", "corn", "arroz", "rice"], t: "cereal", d: "Cereal; aporta carbohidratos.", ojo: false },
  // dairy & protein
  { k: ["leche", "milk", "suero de leche", "whey", "lactosa", "lactose", "caseina", "casein", "solidos de leche", "milk solids", "queso", "cheese", "yogurt"], t: "lacteo", d: "Ingrediente de la leche; aporta proteína y calcio. Ojo si tienes intolerancia a la lactosa.", ojo: false },
  { k: ["huevo", "egg", "proteina de soya", "soy protein", "proteina", "protein", "carne", "pollo", "chicken", "res", "beef", "cerdo", "pork", "atun", "tuna"], t: "proteina", d: "Fuente de proteína.", ojo: false },
  { k: ["soya", "soy", "soja"], t: "proteina", d: "Leguminosa usada como proteína o emulsificante; es un alérgeno común.", ojo: false },
  { k: ["cacahuate", "peanut", "almendra", "almond", "nuez", "nut", "avellana", "hazelnut"], t: "proteina", d: "Fruto seco: grasas buenas y proteína; alérgeno común.", ojo: false },
  // salt & water
  { k: ["sal yodada", "sal", "salt", "cloruro de sodio", "sodium chloride"], t: "sal", d: "Sal: da sabor y conserva. En exceso sube la presión arterial.", ojo: true },
  { k: ["agua", "water", "agua carbonatada", "carbonated water"], t: "agua", d: "Agua.", ojo: false },
  // flavors
  { k: ["saborizante artificial", "artificial flavor", "sabor artificial"], t: "sabor", d: "Sabor hecho en laboratorio para imitar un sabor natural.", ojo: false },
  { k: ["saborizante", "sabor natural", "natural flavor", "flavor", "aroma", "vainillina", "vanillin"], t: "sabor", d: "Da o refuerza el sabor; la etiqueta no dice de qué está hecho.", ojo: false },
  { k: ["cacao", "cocoa", "chocolate"], t: "fruta", d: "Cacao: da sabor a chocolate; en polvo aporta fibra y antioxidantes.", ojo: false },
  // additives without E-number in the main list
  { k: ["bicarbonato de sodio", "sodium bicarbonate", "polvo para hornear", "baking powder", "leudante"], t: "aditivo", d: "Leudante: hace que la masa se esponje al hornear.", ojo: false },
  { k: ["lecitina", "lecithin"], t: "aditivo", d: "Emulsificante (normalmente de soya o girasol) que ayuda a mezclar agua y grasa. Bajo riesgo.", ojo: false },
  { k: ["goma xantana", "xanthan", "goma guar", "guar", "goma arabiga", "pectina", "pectin", "gelatina", "gelatin", "grenetina", "agar"], t: "aditivo", d: "Espesante o gelificante: da textura. Bajo riesgo.", ojo: false },
  { k: ["acido citrico", "citric acid", "acido ascorbico", "ascorbic acid"], t: "aditivo", d: "Acidulante o antioxidante (el ascórbico es vitamina C). Bajo riesgo.", ojo: false },
  { k: ["sorbato de potasio", "potassium sorbate", "propionato", "propionate"], t: "aditivo", d: "Conservador: evita hongos y alarga la vida del producto. Bajo riesgo.", ojo: false },
  { k: ["mono y digliceridos", "mono- and diglycerides", "monogliceridos", "esteres", "polisorbato"], t: "aditivo", d: "Emulsificante: mantiene la mezcla uniforme.", ojo: false },
  { k: ["fosfato", "phosphate", "pirofosfato"], t: "aditivo", d: "Fosfato: regula la acidez, da textura o aporta calcio. En exceso no conviene si tienes problemas renales.", ojo: false },
  { k: ["sulfito", "sulfite", "metabisulfito", "bisulfito"], t: "aditivo", d: "Conservador que evita que la fruta se oscurezca; algunas personas con asma son sensibles a él.", ojo: false },
  { k: ["carbonato de calcio", "calcium carbonate", "estearato de calcio", "calcium stearate"], t: "aditivo", d: "Sal de calcio: evita que se apelmace o aporta calcio. Bajo riesgo.", ojo: false },
  { k: ["colorante", "color", "caramelo"], t: "aditivo", d: "Colorante: solo cambia el color del producto.", ojo: false },
  { k: ["cafeina", "caffeine", "cafe", "coffee", "guarana", "te verde", "green tea"], t: "otro", d: "Estimulante; no se recomienda en niños.", ojo: true },
  // vitamins
  { k: ["vitamina", "vitamin", "hierro", "iron", "zinc", "acido folico", "folic acid", "calcio", "calcium", "niacina", "tiamina", "riboflavina", "minerales"], t: "vitamina", d: "Vitamina o mineral añadido para enriquecer el producto.", ojo: false },
  { k: ["fibra", "fiber", "inulina", "inulin"], t: "cereal", d: "Fibra: ayuda a la digestión y a sentirse satisfecho.", ojo: false },
  { k: ["canela", "cinnamon", "especias", "spices", "pimienta", "comino", "oregano", "vainilla", "vanilla", "paprika", "curcuma", "turmeric"], t: "fruta", d: "Especia o condimento: da sabor y aroma.", ojo: false },
  { k: ["fruta", "fruit", "manzana", "apple", "fresa", "strawberry", "platano", "banana", "naranja", "orange", "limon", "lemon", "tomate", "tomato", "jitomate", "cebolla", "onion", "ajo", "garlic", "chile", "pepper", "verdura", "vegetable"], t: "fruta", d: "Fruta, verdura o especia.", ojo: false },
];

/** Split an ingredient list on top-level commas, keeping parenthesized sub-ingredients with their parent. */
export function splitIngredients(text) {
  if (!text) return [];
  const out = []; let depth = 0, cur = "";
  const src = text.replace(/^\s*ingredientes?\s*:?\s*/i, "").replace(/^\s*ingredients?\s*:?\s*/i, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if ("([".includes(ch)) depth++;
    if (")]".includes(ch)) depth = Math.max(0, depth - 1);
    // a comma or period between digits is a decimal ("0,7%", "0.04 g"), not a separator
    const decimal = (ch === "," || ch === ".") && /\d/.test(src[i - 1] || "") && /\d/.test(src[i + 1] || "");
    if (depth === 0 && !decimal && (ch === "," || ch === ";" || ch === ".")) { if (cur.trim()) out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(s => s.length > 1 && !/^(contiene|puede contener|contains|may contain)\b/i.test(s)).slice(0, 40);
}

/** Offline explanation of one ingredient, or null if it isn't in the dictionary. */
export function explainLocal(name) {
  // explain the main ingredient, not what's in its parentheses ("manzana (manzana, sulfito)" is apple)
  const main = String(name).replace(/[([].*$/, "").trim();
  return (main && main !== name && matchLocal(main)) || matchLocal(name);
}
function matchLocal(name) {
  const n = " " + norm(name).replace(/[^a-z0-9#]+/g, " ") + " ";
  const add = ADDITIVES.find(a => a.k.some(k => /^e\d/.test(k) ? new RegExp("\\b" + k + "(?![0-9])").test(n) : n.includes(norm(k))));
  if (add) return { tipo: /^edulcorante/i.test(add.w) ? "edulcorante" : "aditivo", que_es: `${add.n}. ${add.w}`, ojo: add.r !== "bajo" };
  // longest key wins, so "harina de trigo integral" beats "harina"
  let best = null, len = 0;
  for (const e of DICT) for (const k of e.k) { const kk = norm(k); if (kk.length > len && n.includes(" " + kk)) { best = e; len = kk.length; } }
  return best ? { tipo: best.t, que_es: best.d, ojo: best.ojo } : null;
}
