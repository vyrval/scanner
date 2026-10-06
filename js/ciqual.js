// Aliments génériques (fruits, légumes, viandes, féculents…) sans code-barres,
// tirés de la table Ciqual de l'ANSES (licence ouverte Etalab).
// Le fichier data/ciqual.json est généré par tools/ciqual.mjs, chargé à la
// première recherche et gardé hors ligne par le service worker.
// La recherche est locale : instantanée, sans limite de requêtes.

export const PREFIX = "ciqual-";

let foods = null; // [{ product, raw, words }]
let loading = null;

// "Pâtes, crues" -> ["pates", "crues"]
const fold = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae");
const words = (s) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);
// « concombres » doit trouver « Concombre »
const stem = (w) => (w.length > 3 ? w.replace(/[sx]$/, "") : w);

function toProduct(row, fields) {
  const r = Object.fromEntries(fields.map((f, i) => [f, row[i]]));
  return {
    id: PREFIX + r.code,
    code: null,
    name: r.name,
    brand: "",
    quantity: "",
    image: "",
    nutriscore: "",
    serving: null,
    nova: null,
    generic: true,
    per100: { kcal: r.kcal, prot: r.prot, carbs: r.carbs, fat: r.fat, fiber: r.fiber, sugars: r.sugars, salt: r.salt },
  };
}

function load() {
  return (loading ??= fetch("data/ciqual.json")
    .then((r) => {
      if (!r.ok) throw new Error();
      return r.json();
    })
    .then((d) => {
      foods = d.foods.map((row) => {
        const product = toProduct(row, d.fields);
        const raw = words(product.name);
        return { product, raw, words: raw.map(stem) };
      });
    })
    .catch(() => {
      loading = null; // on retentera à la prochaine recherche
      throw new Error("Table des aliments bruts indisponible.");
    }));
}

// Chaque mot tapé doit commencer un mot du nom. Passent devant : les noms qui
// commencent par le premier mot tapé, puis ceux qui le contiennent tel quel
// (« pates » : Pâtes avant Pâté), puis les plus courts (« Concombre, cru »
// avant « Salade de concombre à la crème »).
export async function search(q, limit = 20) {
  await load();
  const typed = words(q);
  const terms = typed.map(stem);
  if (!terms.length) return [];
  const hits = [];
  for (const f of foods) {
    if (!terms.every((t) => f.words.some((w) => w.startsWith(t)))) continue;
    const lead = f.words[0].startsWith(terms[0]) ? 0 : 1;
    const exact = f.raw.includes(typed[0]) ? 0 : 1;
    hits.push([lead * 2000 + exact * 1000 + f.product.name.length, f.product]);
  }
  return hits.sort((a, b) => a[0] - b[0]).slice(0, limit).map((h) => h[1]);
}
