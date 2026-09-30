// Activités courantes et leur intensité en MET
// (valeurs arrondies du Compendium of Physical Activities).
// On compte les calories NETTES : (MET − 1) × kg × heures.
// Le « − 1 » retire le métabolisme de repos, déjà inclus dans l'objectif du jour.

export const ACTIVITY_GROUPS = [
  ["Course à pied", [
    ["run-8", "Course · 8 km/h", 8.3],
    ["run-10", "Course · 10 km/h", 9.8],
    ["run-12", "Course · 12 km/h", 11.5],
    ["trail", "Trail", 9.0],
  ]],
  ["Marche", [
    ["walk", "Marche · 5 km/h", 3.5],
    ["walk-fast", "Marche rapide · 6,5 km/h", 5.0],
    ["hike", "Randonnée", 6.0],
  ]],
  ["Vélo", [
    ["bike-easy", "Vélo · balade", 4.0],
    ["bike-mod", "Vélo · 16–19 km/h", 6.8],
    ["bike-fast", "Vélo · 20–25 km/h", 8.0],
    ["bike-indoor", "Vélo d'appartement", 6.8],
  ]],
  ["Salle", [
    ["weights", "Musculation", 5.0],
    ["hiit", "HIIT / circuit", 8.0],
    ["row", "Rameur", 7.0],
    ["elliptical", "Elliptique", 5.0],
    ["yoga", "Yoga", 2.5],
    ["pilates", "Pilates", 3.0],
  ]],
  ["Sports", [
    ["swim", "Natation · modérée", 5.8],
    ["swim-fast", "Natation · soutenue", 9.8],
    ["foot", "Football", 7.0],
    ["tennis", "Tennis", 7.3],
    ["badminton", "Badminton", 5.5],
    ["climb", "Escalade", 7.5],
    ["dance", "Danse", 5.0],
  ]],
];

export const OTHER = "other";

const BY_KEY = new Map(ACTIVITY_GROUPS.flatMap(([, items]) => items.map(([k, label, met]) => [k, { label, met }])));

export const activityInfo = (key) => BY_KEY.get(key) ?? null;

export function activityKcal(key, weightKg, minutes) {
  const a = BY_KEY.get(key);
  if (!a || !weightKg || !minutes) return null;
  return Math.round((a.met - 1) * weightKg * (minutes / 60));
}
