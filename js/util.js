// Helpers : formatage, calculs nutritionnels, dates.

export const NUTRIENTS = [
  { key: "kcal", label: "Énergie", unit: "kcal", dec: 0 },
  { key: "fat", label: "Matières grasses", unit: "g", dec: 1 },
  { key: "carbs", label: "Glucides", unit: "g", dec: 1 },
  { key: "sugars", label: "dont sucres", unit: "g", dec: 1, sub: true },
  { key: "fiber", label: "Fibres", unit: "g", dec: 1 },
  { key: "prot", label: "Protéines", unit: "g", dec: 1 },
  { key: "salt", label: "Sel", unit: "g", dec: 2 },
];

export const MACROS = [
  { key: "prot", label: "Protéines" },
  { key: "carbs", label: "Glucides" },
  { key: "fat", label: "Lipides" },
  { key: "fiber", label: "Fibres" },
];

const KEYS = NUTRIENTS.map((n) => n.key);

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// "12,5" -> 12.5 ; vide ou invalide -> null
export const num = (v) => {
  if (v === "" || v == null) return null;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export const fmt = (v, dec = 0) =>
  v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("fr-FR", { maximumFractionDigits: dec });

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---------- Nutrition ----------
export function scale(per100, qty) {
  const o = {};
  for (const k of KEYS) o[k] = per100?.[k] == null ? null : (per100[k] * qty) / 100;
  return o;
}

export function sum(list) {
  const o = Object.fromEntries(KEYS.map((k) => [k, 0]));
  for (const x of list) for (const k of KEYS) o[k] += x[k] ?? 0;
  return o;
}

export const entryTotals = (e) => scale(e.per100, e.qty);
export const mealTotals = (m) => sum(m.entries.map(entryTotals));
export const dayTotals = (d) => sum(d.meals.flatMap((m) => m.entries.map(entryTotals)));
export const burnedKcal = (d) => d.activities.reduce((a, x) => a + (x.kcal || 0), 0);
export const sortMeals = (meals) => [...meals].sort((a, b) => a.time.localeCompare(b.time));

// ---------- Dates (clé locale YYYY-MM-DD) ----------
const pad = (n) => String(n).padStart(2, "0");
export const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayKey = () => keyOf(new Date());
export const parseKey = (k) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export function addDays(k, n) {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return keyOf(d);
}
export function dayLabel(k) {
  const t = todayKey();
  if (k === t) return "Aujourd'hui";
  if (k === addDays(t, -1)) return "Hier";
  if (k === addDays(t, 1)) return "Demain";
  const s = parseKey(k).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export const nowTime = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export function suggestMealName(time) {
  const h = parseInt(time, 10);
  if (h < 4) return "Collation";
  if (h < 11) return "Petit-déjeuner";
  if (h < 15) return "Déjeuner";
  if (h < 18) return "Goûter";
  if (h < 22) return "Dîner";
  return "Collation";
}
