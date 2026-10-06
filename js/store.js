// État de l'appli, persisté en entier dans le localStorage.
//
// {
//   version: 1,
//   goals:    { kcal, prot, carbs, fat, fiber }         (null = non suivi)
//   profile:  { weight }                               (kg)
//   lastActivity: clé de la dernière activité saisie
//   products: { [id]: { id, code, name, brand, quantity, image, nutriscore,
//                        serving, per100, manual?, generic?, saved, lastUsed } }
//                        (generic : aliment brut Ciqual, id « ciqual-<code> »)
//   days:     { "YYYY-MM-DD": { meals: [{ id, name, time, entries: [
//                   { id, productId, name, brand, qty, per100 } ] }],
//                 activities: [{ id, type, name, minutes, kcal, manual }] } }
// }
// Chaque entrée garde une copie de per100 : l'historique ne bouge pas
// si la fiche Open Food Facts change.

const KEY = "carnet:v1";
const listeners = new Set();

const defaults = () => ({
  version: 1,
  goals: { kcal: 2000, prot: 120, carbs: 230, fat: 70, fiber: 30 },
  profile: { weight: null },   // kg, pour le calcul des activités
  lastActivity: "run-10",
  products: {},
  days: {},
});

let state = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.version === 1) return { ...defaults(), ...s };
  } catch {}
  return defaults();
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Sauvegarde impossible", e);
  }
}

const emit = () => listeners.forEach((fn) => fn(state));

export const getState = () => state;
export const subscribe = (fn) => listeners.add(fn);

export function update(fn) {
  fn(state);
  save();
  emit();
}

const EMPTY_DAY = Object.freeze({ meals: [], activities: [] });
export const getDay = (date) => state.days[date] ?? EMPTY_DAY;
export const ensureDay = (s, date) => (s.days[date] ??= { meals: [], activities: [] });

// Supprime les journées vides pour garder le stockage propre.
export function pruneDay(s, date) {
  const d = s.days[date];
  if (d && !d.meals.length && !d.activities.length) delete s.days[date];
}

// ---------- Sauvegarde / restauration ----------
export const exportData = () => JSON.stringify(state, null, 2);

export function importData(text) {
  const s = JSON.parse(text);
  if (!s || s.version !== 1 || typeof s.days !== "object" || typeof s.products !== "object") {
    throw new Error("Ce fichier n'est pas une sauvegarde du Carnet.");
  }
  state = { ...defaults(), ...s };
  save();
  emit();
}

export function wipe() {
  state = defaults();
  save();
  emit();
}

export const sizeKb = () => Math.round((localStorage.getItem(KEY)?.length ?? 0) / 1024);

// Demande au navigateur de ne pas effacer les données (Safari, mode économie…).
export async function requestPersist() {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
