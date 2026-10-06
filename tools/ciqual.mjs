// Convertit la table Ciqual de l'ANSES (XML) en data/ciqual.json pour l'appli.
//
// Source : https://ciqual.anses.fr (licence ouverte Etalab).
// Télécharger et dézipper le XML (ex. XML_2020_07_07.zip), puis :
//   node tools/ciqual.mjs chemin/du/dossier_xml
//
// On ne garde que les nutriments affichés par l'appli, pour 100 g.

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = process.argv[2];
if (!dir) {
  console.error("Usage : node tools/ciqual.mjs <dossier contenant alim_*.xml et compo_*.xml>");
  process.exit(1);
}

const find = (prefix) => {
  const f = readdirSync(dir).find((x) => x.startsWith(prefix) && x.endsWith(".xml"));
  if (!f) throw new Error(`Fichier ${prefix}*.xml introuvable dans ${dir}`);
  return join(dir, f);
};
const read = (path) => new TextDecoder("windows-1252").decode(readFileSync(path));
const tag = (block, name) => (new RegExp(`<${name}>([^<]*)</${name}>`).exec(block)?.[1] ?? "").trim();

// Codes des constituants Ciqual -> clés de per100 dans l'appli (le premier trouvé gagne).
const CONST = {
  kcal: ["328", "333"],     // Énergie règlement UE (kcal), sinon Jones
  prot: ["25000", "25003"], // Protéines N x Jones, sinon N x 6,25
  carbs: ["31000"],
  fat: ["40000"],
  fiber: ["34100"],
  sugars: ["32000"],
  salt: ["10004"],
};
const KEYS = Object.keys(CONST);

// "12,5" -> 12.5 ; "traces" et "< 0,5" -> 0 ; "-" ou vide -> null
function value(s) {
  if (!s || s === "-") return null;
  if (/^traces$/i.test(s) || s.startsWith("<")) return 0;
  const x = parseFloat(s.replace(",", "."));
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : null;
}

const foods = new Map();
for (const [, b] of read(find("alim_")).matchAll(/<ALIM>([\s\S]*?)<\/ALIM>/g)) {
  const code = tag(b, "alim_code");
  const name = tag(b, "alim_nom_fr").replace(/\s+/g, " ");
  if (code && name) foods.set(code, { name, v: {} });
}

for (const [, b] of read(find("compo_")).matchAll(/<COMPO>([\s\S]*?)<\/COMPO>/g)) {
  const f = foods.get(tag(b, "alim_code"));
  if (f) f.v[tag(b, "const_code")] = value(tag(b, "teneur"));
}

// Énergie absente (ex. pomme crue) : recalculée avec les coefficients du
// règlement UE 1169/2011, si au moins protéines et glucides sont connus.
const FACTORS = { "25000": 4, "31000": 4, "40000": 9, "34100": 2, "60000": 7, "65000": 3, "34000": 2.4 };
function kcalFromMacros(v) {
  if (v["25000"] == null || v["31000"] == null) return null;
  const k = Object.entries(FACTORS).reduce((s, [c, f]) => s + (v[c] ?? 0) * f, 0);
  return Math.round(k * 10) / 10;
}

const rows = [];
for (const [code, f] of foods) {
  const vals = KEYS.map((k) => CONST[k].map((c) => f.v[c]).find((x) => x != null) ?? null);
  vals[0] ??= kcalFromMacros(f.v);
  if (vals[0] == null) continue; // sans calories, inutilisable dans le carnet
  rows.push([Number(code), f.name, ...vals]);
}
rows.sort((a, b) => a[1].localeCompare(b[1], "fr"));

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "ciqual.json");
mkdirSync(dirname(out), { recursive: true });
const version = /(\d{4})_\d{2}_\d{2}/.exec(find("alim_"))?.[1] ?? "";
writeFileSync(out, JSON.stringify({ source: `Ciqual ${version} (ANSES)`, fields: ["code", "name", ...KEYS], foods: rows }));
console.log(`${rows.length} aliments écrits dans ${out}`);
