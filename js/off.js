// Accès à Open Food Facts, appelé directement depuis le navigateur.
//
// - Fiche produit : world.openfoodfacts.org/api/v2/product (fiable, 15 req/min).
// - Recherche par nom : search.openfoodfacts.org (« Search-a-licious »), le
//   moteur recommandé par OFF. L'ancien cgi/search.pl répond souvent 503 sans
//   en-têtes CORS, ce que le navigateur affiche comme « Failed to fetch » :
//   il ne sert plus que de secours. 10 req/min pour la recherche.

const FIELDS = [
  "code", "product_name", "product_name_fr", "brands", "quantity",
  "image_front_small_url", "nutriscore_grade", "nutriments", "serving_quantity",
].join(",");

const n = (v) => {
  const x = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(x) ? x : null;
};

// Les deux moteurs ne renvoient pas toujours le même format :
// chaîne, liste, ou objet par langue ({ fr, main, … }).
function text(v, lang = "fr") {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((x) => text(x, lang)).filter(Boolean).join(", ");
  if (typeof v === "object") return text(v[lang] ?? v.main ?? Object.values(v)[0], lang);
  return String(v);
}

export function normalize(p) {
  const nu = p.nutriments || {};
  const kj = n(nu.energy_100g);
  const grade = text(p.nutriscore_grade).toLowerCase();
  return {
    id: String(p.code),
    code: String(p.code),
    name: (text(p.product_name_fr) || text(p.product_name) || "Produit sans nom").trim(),
    brand: text(p.brands).split(",")[0].trim(),
    quantity: text(p.quantity),
    image: text(p.image_front_small_url),
    nutriscore: /^[a-e]$/.test(grade) ? grade : "",
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

// fetch avec délai max et messages compréhensibles.
async function getJSON(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let r;
  try {
    r = await fetch(url, { signal: ctrl.signal });
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Open Food Facts ne répond pas. Réessaie dans un moment.");
    if (!navigator.onLine) throw new Error("Pas de connexion internet.");
    // TypeError « Failed to fetch » : serveur en panne, limite atteinte ou réseau coupé.
    throw new Error("Open Food Facts est injoignable pour l'instant (serveur surchargé ou limite de requêtes). Réessaie dans une minute.");
  } finally {
    clearTimeout(timer);
  }
  if (r.status === 429) throw new Error("Trop de requêtes vers Open Food Facts, réessaie dans une minute.");
  if (!r.ok && r.status !== 404) throw new Error(`Open Food Facts a répondu une erreur (${r.status}). Réessaie plus tard.`);
  try {
    return await r.json();
  } catch {
    throw new Error("Réponse illisible d'Open Food Facts. Réessaie plus tard.");
  }
}

export async function getByCode(code) {
  const data = await getJSON(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`);
  return data.status === 1 && data.product ? normalize({ code, ...data.product }) : null;
}

const clean = (list) => list.filter((p) => p.code && /^\d{6,14}$/.test(p.code)).map(normalize);

async function searchNew(q) {
  const url = "https://search.openfoodfacts.org/search" +
    `?q=${encodeURIComponent(q)}&langs=fr&page_size=30&fields=${FIELDS}`;
  const data = await getJSON(url);
  return clean(data.hits || []);
}

async function searchLegacy(q) {
  const url = "https://world.openfoodfacts.org/cgi/search.pl?action=process&json=1&search_simple=1" +
    `&search_terms=${encodeURIComponent(q)}&page_size=30&lc=fr&cc=fr&fields=${FIELDS}`;
  const data = await getJSON(url, 15000);
  return clean(data.products || []);
}

// Les résultats n'ont pas toujours les valeurs nutritionnelles :
// la fiche complète est rechargée à l'ouverture (getByCode).
export async function search(q) {
  try {
    return await searchNew(q);
  } catch (first) {
    try {
      return await searchLegacy(q);
    } catch {
      throw first;
    }
  }
}
