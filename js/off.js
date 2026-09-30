// Accès à l'API Open Food Facts (appelée directement depuis le navigateur).

const FIELDS = [
  "code", "product_name", "product_name_fr", "brands", "quantity",
  "image_front_small_url", "nutriscore_grade", "nutriments", "serving_quantity",
].join(",");

const n = (v) => {
  const x = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(x) ? x : null;
};

export function normalize(p) {
  const nu = p.nutriments || {};
  const kj = n(nu.energy_100g);
  return {
    id: p.code,
    code: p.code,
    name: (p.product_name_fr || p.product_name || "Produit sans nom").trim(),
    brand: (p.brands || "").split(",")[0].trim(),
    quantity: p.quantity || "",
    image: p.image_front_small_url || "",
    nutriscore: /^[a-e]$/i.test(p.nutriscore_grade || "") ? p.nutriscore_grade.toLowerCase() : "",
    serving: n(p.serving_quantity) || null,
    per100: {
      kcal: n(nu["energy-kcal_100g"]) ?? (kj != null ? kj / 4.184 : null),
      prot: n(nu.proteins_100g),
      carbs: n(nu.carbohydrates_100g),
      fat: n(nu.fat_100g),
      fiber: n(nu.fiber_100g),
      sugars: n(nu.sugars_100g),
      salt: n(nu.salt_100g),
    },
  };
}

async function getJSON(url) {
  const r = await fetch(url);
  if (r.status === 429) throw new Error("Trop de requêtes vers Open Food Facts, réessaie dans une minute.");
  if (!r.ok && r.status !== 404) throw new Error(`Open Food Facts a répondu ${r.status}.`);
  return r.json();
}

export async function getByCode(code) {
  const data = await getJSON(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`);
  return data.status === 1 && data.product ? normalize({ code, ...data.product }) : null;
}

// Recherche plein texte, limitée aux produits vendus en France.
// OFF limite la recherche à ~10 requêtes/min : on ne cherche qu'à la validation.
export async function search(q) {
  const url =
    "https://world.openfoodfacts.org/cgi/search.pl?action=process&json=1&search_simple=1" +
    `&search_terms=${encodeURIComponent(q)}&page_size=30&lc=fr&cc=fr&fields=${FIELDS}`;
  const data = await getJSON(url);
  return (data.products || [])
    .filter((p) => p.code)
    .map(normalize)
    .filter((p) => p.per100.kcal != null);
}
