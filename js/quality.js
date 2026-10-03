// Transformation, additifs, allergènes, ingrédients : infos qualitatives Open Food Facts.

export const NOVA = {
  1: { label: "Brut ou peu transformé", desc: "Aliments non transformés ou transformés minimalement." },
  2: { label: "Ingrédient culinaire", desc: "Huile, beurre, sucre, sel… utilisés pour cuisiner." },
  3: { label: "Transformé", desc: "Aliments transformés avec sel, sucre ou matière grasse (conserves, fromages, pain…)." },
  4: { label: "Ultra-transformé", desc: "Formulations industrielles avec des ingrédients ou additifs qu'on n'utilise pas en cuisine." },
};

// Les 14 allergènes à déclaration obligatoire (UE).
const ALLERGENS = {
  gluten: "Gluten", crustaceans: "Crustacés", eggs: "Œufs", fish: "Poisson", peanuts: "Arachides",
  soybeans: "Soja", milk: "Lait", nuts: "Fruits à coque", celery: "Céleri", mustard: "Moutarde",
  "sesame-seeds": "Sésame", "sulphur-dioxide-and-sulphites": "Sulfites", lupin: "Lupin", molluscs: "Mollusques",
};

const untag = (t) => String(t).replace(/^[a-z]{2}:/, "");
const tagText = (t) => untag(t).replace(/-/g, " ");
// "en:e330" -> "E330", "en:e150d" -> "E150d"
const eCode = (t) => untag(t).replace(/^e(\d+)(.*)$/, (_, d, rest) => `E${d}${rest}`);
// E322 et E322i en double : on garde le code de base.
const dedupeAdditives = (codes) => {
  const set = [...new Set(codes)];
  return set.filter((c) => { const base = c.match(/^E\d+/)?.[0]; return c === base || !set.includes(base); });
};
const isAdditive = (t) => /^e\d/.test(untag(t));

const list = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") : v?.fr ?? v?.main ?? "");

// Version des infos stockées : on recharge les produits enregistrés avec une
// version plus ancienne (ex. ingrédients mal récupérés avant la v2).
export const QUALITY_VERSION = 2;

// Le texte des ingrédients peut être dans plusieurs champs selon les fiches :
// français, langue principale du produit, anglais, ou seulement la liste détaillée.
function ingredientsText(p) {
  const lc = typeof p.lang === "string" ? p.lang : typeof p.lc === "string" ? p.lc : "";
  const candidates = [
    p.ingredients_text_fr, p.ingredients_text_with_allergens_fr, p.ingredients_text,
    lc ? p[`ingredients_text_${lc}`] : null, p.ingredients_text_en,
  ];
  for (const c of candidates) {
    const t = str(c).replace(/<[^>]+>/g, "").replace(/_/g, "").trim();
    if (t) return t;
  }
  // Dernier recours : la liste structurée [{ text, ingredients: [...] }, …]
  const flat = (list) => list.map((i) => (i.ingredients?.length ? `${i.text} (${flat(i.ingredients)})` : i.text)).filter(Boolean).join(", ");
  return Array.isArray(p.ingredients) ? flat(p.ingredients) : "";
}

// À partir d'un produit brut OFF -> champs compacts stockés avec le produit.
export function extractQuality(p) {
  const nova = Number(p.nova_group);
  const markers = p.nova_groups_markers?.["4"] ?? p.nova_groups_markers?.[4] ?? [];
  const analysis = list(p.ingredients_analysis_tags);
  const labels = list(p.labels_tags);
  return {
    nova: nova >= 1 && nova <= 4 ? nova : null,
    // Ce qui fait passer en NOVA 4 : additifs (codes E) et ingrédients marqueurs.
    novaWhy: [...new Set(list(markers).map(([kind, tag]) =>
      kind === "additives" || isAdditive(tag) ? eCode(tag) : tagText(tag)))].slice(0, 8),
    additives: dedupeAdditives(list(p.additives_tags).filter(isAdditive).map(eCode)),
    allergens: [...new Set(list(p.allergens_tags).map((t) => ALLERGENS[untag(t)] ?? tagText(t)))],
    ingredients: ingredientsText(p).slice(0, 1500),
    organic: labels.some((t) => /organic|agriculture-biologique|^fr:bio$|eu-organic/.test(t)),
    palmOil: analysis.includes("en:palm-oil") ? true : analysis.includes("en:palm-oil-free") ? false : null,
    checked: true, // les infos ont été demandées à OFF (même si vides)
    v: QUALITY_VERSION,
  };
}

export const QUALITY_FIELDS = [
  "nova_group", "nova_groups_markers", "additives_tags", "allergens_tags",
  "ingredients_text_fr", "ingredients_text_with_allergens_fr", "ingredients_text", "ingredients_text_en",
  "ingredients", "lang", "lc", "labels_tags", "ingredients_analysis_tags",
];
