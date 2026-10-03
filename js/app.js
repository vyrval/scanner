import * as store from "./store.js";
import * as off from "./off.js";
import { startScanner, stopScanner } from "./scanner.js";
import { ACTIVITY_GROUPS, OTHER, activityInfo, activityKcal } from "./activities.js";
import { NOVA, QUALITY_VERSION } from "./quality.js";
import { VERSION } from "./version.js";
import {
  NUTRIENTS, esc, num, fmt, uid, scale, entryTotals, mealTotals, dayTotals,
  burnedKcal, sortMeals, todayKey, addDays, parseKey, keyOf, nowTime, suggestMealName,
} from "./util.js";

const $ = (s, root = document) => root.querySelector(s);
const view = $("#view");
const sheet = $("#sheet");

const ui = {
  view: "day",
  date: todayKey(),
  mealId: null,      // repas cible des ajouts
  query: "",
  results: null,     // résultats de recherche (null = listes récents/enregistrés)
  addTab: "recent",
  pfilter: "",
  ptab: "saved",
};
const cache = new Map(); // produits vus en recherche, pas encore stockés

const MACROS = [
  { key: "prot", label: "Protéines", short: "Prot." },
  { key: "carbs", label: "Glucides", short: "Gluc." },
  { key: "fat", label: "Lipides", short: "Lip." },
  { key: "fiber", label: "Fibres", short: "Fibres" },
];

const ICON = {
  prev: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>`,
  next: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>`,
  down: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`,
  sliders: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>`,
  star: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/></svg>`,
  starFill: `<svg viewBox="0 0 24 24" aria-hidden="true" class="filled"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/></svg>`,
  search: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
  minus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>`,
  close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  torch: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l-1 5H9zM9 8h6l-1 6v7h-4v-7z"/><path d="M12 14v2"/></svg>`,
  more: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>`,
};

const findProduct = (id) => store.getState().products[id] ?? cache.get(id);
const defaultTime = () => (ui.date === todayKey() ? nowTime() : "12:00");
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function relLabel(k) {
  const t = todayKey();
  if (k === t) return "Aujourd'hui";
  if (k === addDays(t, -1)) return "Hier";
  if (k === addDays(t, 1)) return "Demain";
  return cap(parseKey(k).toLocaleDateString("fr-FR", { weekday: "long" }));
}
const longDate = (k) => parseKey(k).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

// « Ajouter au déjeuner », « à la collation », sinon « à "Nom" »
const ARTICLES = {
  "petit-déjeuner": "au petit-déjeuner", "déjeuner": "au déjeuner", "goûter": "au goûter",
  "dîner": "au dîner", "collation": "à la collation", "brunch": "au brunch", "en-cas": "à l'en-cas",
};
const toMeal = (name) => ARTICLES[name.trim().toLowerCase()] ?? `à « ${name.trim()} »`;

// "450 g", "4 x 125 g", "1,5 l" -> grammes (ml ≈ g)
function parseGrams(q) {
  const m = /(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*(kg|g|l|cl|ml)\b/i.exec(q || "");
  if (!m) return null;
  const mult = { kg: 1000, g: 1, l: 1000, cl: 10, ml: 1 }[m[3].toLowerCase()];
  const v = (m[1] ? +m[1] : 1) * num(m[2]) * mult;
  return v > 0 && v <= 5000 ? Math.round(v) : null;
}

// ======================================================================
// Composants
// ======================================================================
const bar = (value, goal, tone) => {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  const over = goal > 0 && value > goal;
  return `<div class="bar"><i class="tone-${tone}${over ? " over" : ""}" style="width:${pct}%"></i></div>`;
};

const thumb = (p, big = false) => p?.image
  ? `<img class="thumb${big ? " big" : ""}" src="${esc(p.image)}" alt="">`
  : `<span class="thumb${big ? " big" : ""}${p?.manual ? " perso" : ""}" aria-hidden="true">${esc((p?.name || "?").trim().charAt(0).toUpperCase())}</span>`;

const nutriChip = (g) => (g ? `<span class="ns ns-${g}">Nutri-Score ${g.toUpperCase()}</span>` : "");

const seg = (group, tabs, cur) => `<div class="seg" role="tablist">${tabs.map(([k, label]) =>
  `<button role="tab" aria-selected="${k === cur}" data-act="tab" data-group="${group}" data-tab="${k}">${label}</button>`).join("")}</div>`;

const ruleHead = (title, right = "", titleAttrs = "") => `
  <div class="rule-head">
    ${titleAttrs ? `<button class="linkish" ${titleAttrs}><h2>${title}</h2></button>` : `<h2>${title}</h2>`}
    ${right}
  </div>`;

function resultGrid(t) {
  return `<div class="result-kcal"><span class="display">${fmt(t.kcal)}</span><span>kcal</span></div>` +
    MACROS.slice(0, 3).map((m) =>
      `<div class="result-m"><span class="num">${fmt(t[m.key], 1)} g</span><span><i class="dot tone-${m.key}"></i>${m.short}</span></div>`).join("");
}

function qtyBlock(q, presets) {
  return `
    <div class="stack-10">
      <span class="eyebrow">Quantité</span>
      <div class="stepper">
        <button type="button" class="stepbtn" data-step="-10" aria-label="Retirer 10 g">${ICON.minus}</button>
        <label class="qtybox"><input name="qty" id="f-qty" inputmode="decimal" value="${q}" required aria-label="Quantité en grammes"><span>g</span></label>
        <button type="button" class="stepbtn" data-step="10" aria-label="Ajouter 10 g">${ICON.plus}</button>
      </div>
      ${presets.length ? `<div class="chips">${presets.map(([v, l]) =>
        `<button type="button" class="chip" data-set-qty="${v}">${esc(l)}</button>`).join("")}</div>` : ""}
    </div>`;
}

function qtyPresets(p, stored) {
  const out = [];
  const add = (v, l) => { if (v && !out.some((x) => x[0] === v)) out.push([v, l]); };
  if (p.serving) add(p.serving, `1 portion · ${fmt(p.serving)} g`);
  add(100, "100 g");
  if (stored?.lastQty) add(stored.lastQty, `Dernière fois · ${fmt(stored.lastQty)} g`);
  const pkg = parseGrams(p.quantity);
  if (pkg) add(pkg, `Le paquet · ${fmt(pkg)} g`);
  return out;
}

function mealPicker(selected, label, withNew = true) {
  const meals = sortMeals(store.getDay(ui.date).meals);
  const sel = meals.some((m) => m.id === selected) ? selected : "";
  return `
    <fieldset class="stack-10">
      <legend class="eyebrow">${label}</legend>
      <div class="chips">
        ${meals.map((m) => `<label class="chip radio"><input type="radio" name="meal" value="${m.id}"${m.id === sel ? " checked" : ""}>${esc(m.name)}</label>`).join("")}
        ${withNew ? `<label class="chip radio new"><input type="radio" name="meal" value=""${sel === "" ? " checked" : ""}>+ Nouveau</label>` : ""}
      </div>
    </fieldset>`;
}

function nutritionLabel(p) {
  return `
    <div class="nlabel">
      <div class="nlabel-head"><span class="display upper">Valeurs nutritionnelles</span><span class="num small">pour 100 g</span></div>
      ${NUTRIENTS.map((n) => `<div class="nrow${n.key === "kcal" ? " strong" : ""}${n.sub ? " sub" : ""}"><span>${n.label}</span><span class="num">${fmt(p.per100[n.key], n.dec)} ${n.unit}</span></div>`).join("")}
    </div>`;
}

// ======================================================================
// Navigation
// ======================================================================
function go(v) {
  if (ui.view === "add" && v !== "add") stopScan();
  ui.view = v;
  render();
  window.scrollTo(0, 0);
}

function render() {
  document.body.classList.toggle("no-tabbar", ui.view === "settings");
  document.querySelectorAll("[data-nav]").forEach((b) =>
    b.setAttribute("aria-current", b.dataset.nav === ui.view ? "page" : "false"));
  ({ day: renderDay, add: renderAdd, products: renderProducts, settings: renderSettings })[ui.view]();
}

// Sur la vue Ajouter, on ne redessine pas tout : la caméra tourne peut-être.
store.subscribe(() => {
  if (ui.view === "add") { renderTarget(); renderResults(); }
  else if (ui.view === "products") renderPLists();
  else render();
});

// ======================================================================
// Journée
// ======================================================================
function renderDay() {
  const g = store.getState().goals;
  const day = store.getDay(ui.date);
  const t = dayTotals(day);
  const burned = burnedKcal(day);
  const budget = (g.kcal ?? 0) + burned;
  const left = budget - t.kcal;
  const meals = sortMeals(day.meals);
  const tracked = MACROS.filter((m) => g[m.key]);

  const macros = tracked.length ? `<div class="macros">${tracked.map((m) => `
    <div class="macro">
      <div class="macro-head"><span>${m.label}</span><span class="num">${fmt(t[m.key])} / ${fmt(g[m.key])} g</span></div>
      ${bar(t[m.key], g[m.key], m.key)}
    </div>`).join("")}</div>` : "";

  const budgetCard = g.kcal ? `
    <section class="budget">
      <div class="budget-top">
        <div class="stack-6">
          <span class="eyebrow">${left >= 0 ? "Il reste" : "Dépassement"}</span>
          <div class="bignum${left < 0 ? " warn" : ""}"><span class="display">${fmt(Math.abs(left))}</span><span>kcal</span></div>
        </div>
        <span class="num small muted">${fmt(budget > 0 ? (t.kcal / budget) * 100 : 0)} % du budget</span>
      </div>
      ${bar(t.kcal, budget, "accent")}
      <div class="equation">
        <div><span class="num">${fmt(g.kcal)}</span><span>Objectif</span></div>
        <div><span class="num accent">+ ${fmt(burned)}</span><span>Sport</span></div>
        <div><span class="num">− ${fmt(t.kcal)}</span><span>Mangé</span></div>
      </div>
      ${macros}
    </section>` : `
    <section class="budget">
      <div class="stack-6"><span class="eyebrow">Mangé</span>
        <div class="bignum"><span class="display">${fmt(t.kcal)}</span><span>kcal</span></div></div>
      <p class="muted small">Aucun objectif défini. <button class="linkish accent" data-act="settings">Définir mes objectifs</button></p>
      ${macros}
    </section>`;

  const mealsHtml = meals.map((m) => `
    <article class="tl">
      <div class="tl-rail"><span class="num">${m.time}</span><i></i></div>
      <div class="card">
        ${ruleHead(esc(m.name), `<span class="rule-right"><span class="num">${fmt(mealTotals(m).kcal)} kcal</span>
          <button class="more" data-act="edit-meal" data-meal="${m.id}" aria-label="Renommer ou supprimer ${esc(m.name)}">${ICON.more}</button></span>`)}
        ${m.entries.length ? m.entries.map((e) => `
          <button class="line" data-act="edit-entry" data-meal="${m.id}" data-entry="${e.id}">
            <span class="line-main"><span>${esc(e.name)}</span><small class="num">${fmt(e.qty)} g</small></span>
            <span class="num">${fmt(entryTotals(e).kcal)}</span>
          </button>`).join("") : `<p class="muted small line-empty">Aucun aliment pour l'instant.</p>`}
        <button class="dashed" data-act="add-to-meal" data-meal="${m.id}">+ Aliment</button>
      </div>
    </article>`).join("");

  const sTime = defaultTime();
  const suggestion = `
    <article class="tl">
      <div class="tl-rail"><span class="num">${sTime}</span></div>
      <button class="suggest" data-act="new-meal">
        <span class="stack-2"><span class="display upper">${esc(suggestMealName(sTime))}</span>
          <span class="muted small">Nouveau repas · nom et heure modifiables</span></span>
        <span class="fab-sm">${ICON.plus}</span>
      </button>
    </article>`;

  view.innerHTML = `
    <header class="dayhead">
      <div class="stack-4 grow">
        <span class="eyebrow">${longDate(ui.date)}</span>
        <button class="linkish datebtn" data-act="calendar" aria-label="Choisir une date"><h1 class="title">${relLabel(ui.date)}</h1>${ICON.down}</button>
      </div>
      <button class="iconbtn" data-act="prev-day" aria-label="Jour précédent">${ICON.prev}</button>
      <button class="iconbtn" data-act="next-day" aria-label="Jour suivant">${ICON.next}</button>
      <button class="iconbtn bare" data-act="settings" aria-label="Réglages">${ICON.sliders}</button>
    </header>
    ${installBanner()}
    ${budgetCard}
    <div class="section-head">
      <span class="eyebrow">Repas</span>
      <span class="num small muted">${meals.length} repas · ${fmt(t.kcal)} kcal</span>
    </div>
    ${mealsHtml}
    ${suggestion}
    <section class="card activities">
      ${ruleHead("Activités", burned ? `<span class="num accent">+ ${fmt(burned)} kcal</span>` : "")}
      ${day.activities.map((a) => `
        <button class="line" data-act="edit-activity" data-id="${a.id}">
          <span class="line-main"><span>${esc(a.name)}</span><small class="num">${fmt(a.minutes)} min</small></span>
          <span class="num accent">+ ${fmt(a.kcal)}</span>
        </button>`).join("")}
      <button class="dashed" data-act="new-activity">+ Activité</button>
    </section>`;
}

// ======================================================================
// Calendrier
// ======================================================================
const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

// État d'un jour : rien, dans le budget, ou au-dessus.
function dayStatus(key) {
  const d = store.getState().days[key];
  if (!d) return null;
  const hasFood = d.meals.some((m) => m.entries.length);
  if (!hasFood && !d.activities.length) return null;
  const goal = store.getState().goals.kcal;
  if (!goal || !hasFood) return "logged";
  return dayTotals(d).kcal > goal + burnedKcal(d) ? "over" : "ok";
}

function calendarGrid(month) { // month : Date au 1er du mois
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // lundi = 0
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const today = todayKey();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(`<span></span>`);
  for (let n = 1; n <= days; n++) {
    const key = keyOf(new Date(month.getFullYear(), month.getMonth(), n));
    const st = dayStatus(key);
    const cls = ["cal-day", key === today ? "is-today" : "", key === ui.date ? "is-sel" : "", key > today ? "is-future" : ""].filter(Boolean).join(" ");
    const label = parseKey(key).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) +
      (st === "ok" ? ", dans l'objectif" : st === "over" ? ", objectif dépassé" : st ? ", données saisies" : "");
    cells.push(`<button type="button" class="${cls}" data-act="cal-pick" data-day="${key}" aria-label="${label}"${key === ui.date ? ' aria-current="date"' : ""}>
      <span class="num">${n}</span>${st ? `<i class="dot st-${st}"></i>` : ""}</button>`);
  }
  const title = month.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const count = Object.keys(store.getState().days).filter((k) => k.startsWith(keyOf(month).slice(0, 7)) && dayStatus(k)).length;
  return `
    <div class="cal-head">
      <button type="button" class="iconbtn" data-act="cal-month" data-dir="-1" aria-label="Mois précédent">${ICON.prev}</button>
      <div class="stack-2 center"><strong class="cal-title">${cap(title)}</strong><span class="muted small">${count ? `${count} jour${count > 1 ? "s" : ""} renseigné${count > 1 ? "s" : ""}` : "Aucune donnée"}</span></div>
      <button type="button" class="iconbtn" data-act="cal-month" data-dir="1" aria-label="Mois suivant">${ICON.next}</button>
    </div>
    <div class="cal-grid" role="grid">
      ${WEEKDAYS.map((w) => `<span class="cal-wd" aria-hidden="true">${w}</span>`).join("")}
      ${cells.join("")}
    </div>`;
}

let calMonth = null;
function openCalendar() {
  const d = parseKey(ui.date);
  calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  const hasGoal = !!store.getState().goals.kcal;
  openSheet(`
    <div id="cal">${calendarGrid(calMonth)}</div>
    <div class="cal-legend small muted">
      ${hasGoal ? `<span><i class="dot st-ok"></i>Dans l'objectif</span><span><i class="dot st-over"></i>Objectif dépassé</span>`
        : `<span><i class="dot st-logged"></i>Jour renseigné</span>`}
    </div>
    <button type="button" class="btn-outline" data-act="cal-today">Aujourd'hui</button>`, () => {});
}

function calMonthStep(step) {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + Number(step), 1);
  $("#cal", sheet).innerHTML = calendarGrid(calMonth);
}

function calPick(key) {
  ui.date = key;
  sheet.close();
  render();
}

// ======================================================================
// Ajouter : scan + recherche
// ======================================================================
const GHOST_CODE = `<svg class="ghostcode" viewBox="0 0 170 70" aria-hidden="true">${
  [[0,6],[10,3],[17,8],[29,3],[36,5],[46,3],[53,9],[66,3],[73,5],[83,3],[90,7],[101,3],[108,5],[118,8],[130,3],[137,6],[147,3],[154,7],[165,5]]
    .map(([x, w]) => `<rect x="${x}" y="0" width="${w}" height="70"/>`).join("")}</svg>`;

function renderAdd() {
  view.innerHTML = `
    <h1 class="title">Ajouter</h1>
    <label class="field" for="mealSel"><span class="muted small">Dans</span><select id="mealSel"></select>${ICON.down}</label>
    <div class="viewfinder" id="vf">
      <video id="video" playsinline muted hidden></video>
      ${GHOST_CODE}
      <span class="corner c-tl"></span><span class="corner c-tr"></span><span class="corner c-bl"></span><span class="corner c-br"></span>
      <span class="scanline" id="scanline" hidden></span>
      <div class="vf-tools" id="vfTools" hidden>
        <button type="button" class="vf-btn" id="zoomBtn" data-act="cam-zoom" hidden aria-label="Zoom">2×</button>
        <button type="button" class="vf-btn" id="torchBtn" data-act="cam-torch" hidden aria-label="Lampe" aria-pressed="false">${ICON.torch}</button>
      </div>
      <span class="focus-ring" id="focusRing" hidden></span>
      <div class="vf-bar">
        <span class="vf-hint" id="vfHint">Scanne le code-barres d'un produit</span>
        <button class="pill-light" data-act="scan" id="scanBtn">Scanner</button>
        <button class="pill-light" data-act="stop-scan" id="stopBtn" hidden>Arrêter</button>
      </div>
    </div>
    <form class="field" id="searchForm" role="search">
      ${ICON.search}
      <input id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="Nom du produit ou code-barres" aria-label="Rechercher un produit" value="${esc(ui.query)}">
    </form>
    <p class="status" id="status" role="status"></p>
    <section id="results" class="stack-10"></section>`;
  renderTarget();
  renderResults();
}

function renderTarget() {
  const el = $("#mealSel");
  if (!el) return;
  const meals = sortMeals(store.getDay(ui.date).meals);
  if (!meals.some((m) => m.id === ui.mealId)) ui.mealId = null;
  const day = ui.date === todayKey() ? "" : ` (${relLabel(ui.date).toLowerCase()})`;
  el.innerHTML = meals.map((m) =>
    `<option value="${m.id}"${m.id === ui.mealId ? " selected" : ""}>${esc(m.name)} · ${m.time} · ${fmt(mealTotals(m).kcal)} kcal${day}</option>`).join("") +
    `<option value=""${ui.mealId ? "" : " selected"}>Nouveau repas · ${esc(suggestMealName(defaultTime()))}${day}</option>`;
}

const quickQty = (p) => p.lastQty ?? p.serving ?? 100;

function productRows(items, quick) {
  return `<div class="stack-8">${items.map((p) => `
    <div class="prow">
      <button class="prow-main" data-act="open-product" data-id="${esc(p.id)}">
        ${thumb(p)}
        <span class="prow-text"><span class="pname">${esc(p.name)}</span>
          <small class="num">${[p.per100.kcal != null ? `${fmt(p.per100.kcal)} kcal / 100 g` : esc(p.brand),
            p.nutriscore ? `Nutri-Score ${p.nutriscore.toUpperCase()}` : "", novaOf(p) ? `NOVA ${novaOf(p)}` : ""].filter(Boolean).join(" · ")}</small></span>
      </button>
      ${quick ? `<button class="quick num" data-act="quick-add" data-id="${esc(p.id)}" aria-label="Ajouter ${fmt(quickQty(p))} g de ${esc(p.name)}">+ ${fmt(quickQty(p))} g</button>` : ""}
    </div>`).join("")}</div>`;
}

function renderResults() {
  const el = $("#results");
  if (!el) return;
  if (ui.results) {
    el.innerHTML = `<span class="eyebrow">Résultats · ${ui.results.length}</span>${productRows(ui.results, false)}`;
    return;
  }
  const all = Object.values(store.getState().products);
  const recent = all.filter((p) => p.lastUsed).sort((a, b) => b.lastUsed - a.lastUsed).slice(0, 15);
  const saved = all.filter((p) => p.saved).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const list = ui.addTab === "saved" ? saved : recent;
  el.innerHTML =
    seg("addTab", [["recent", "Récents"], ["saved", `Enregistrés · ${saved.length}`]], ui.addTab) +
    (list.length ? productRows(list, true)
      : `<p class="muted small empty">${ui.addTab === "saved"
        ? "Aucun produit enregistré. Touche l'étoile sur une fiche produit pour le retrouver ici."
        : "Tes derniers produits apparaîtront ici, avec un bouton pour les rajouter en un geste."}</p>`);
}

function setStatus(msg, err = false, retry = null) {
  const el = $("#status");
  if (!el) return msg && toast(msg, retry);
  el.textContent = msg;
  el.classList.toggle("err", err);
  if (retry) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "linkish accent retry";
    b.textContent = retry.label;
    b.addEventListener("click", retry.run, { once: true });
    el.append(" ", b);
  }
}

async function doSearch(q) {
  q = q.trim();
  ui.query = q;
  if (!q) { ui.results = null; setStatus(""); return renderResults(); }
  if (/^\d{8,14}$/.test(q)) return lookupCode(q);
  if (q.length < 2) return setStatus("Tape au moins 2 lettres.", true);
  setStatus("Recherche…");
  try {
    const res = await off.search(q);
    res.forEach((p) => cache.set(p.id, p));
    ui.results = res;
    setStatus(res.length ? "" : "Aucun résultat. Essaie un autre mot, ou crée le produit dans Produits.");
    renderResults();
  } catch (e) {
    setStatus(e.message, true);
  }
}

let lookingUp = null;
async function lookupCode(code) {
  if (lookingUp === code) return; // même code déjà en cours
  lookingUp = code;
  setStatus(`Recherche de ${code}…`);
  const local = store.getState().products[code];
  try {
    const p = await off.getByCode(code);
    if (p) { cache.set(p.id, p); setStatus(""); return openProduct(p.id); }
    if (local) { setStatus(""); return openProduct(code); }
    setStatus(`Le code ${code} n'est pas dans Open Food Facts. Vérifie le code ou crée le produit dans Produits.`, true);
  } catch (e) {
    if (local) { setStatus(""); return openProduct(code); } // hors ligne : version stockée
    setStatus(e.message, true, { label: "Réessayer", run: () => lookupCode(code) });
  } finally {
    lookingUp = null;
  }
}

function scanUI(on) {
  if (!$("#video")) return;
  $("#video").hidden = !on;
  $("#vf").classList.toggle("live", on);
  $("#scanline").hidden = !on;
  $("#scanBtn").hidden = on;
  $("#stopBtn").hidden = !on;
  $("#vfHint").textContent = on ? "À 15–20 cm · touche l'image pour la mise au point" : "Scanne le code-barres d'un produit";
  if (!on) { cam = null; $("#vfTools").hidden = true; $("#focusRing").hidden = true; }
}

// Réglages caméra (selon le téléphone) : zoom, lampe, toucher pour la mise au point.
let cam = null;
function setupCameraTools(controls) {
  cam = controls;
  const tools = $("#vfTools");
  if (!tools || !cam) return;
  const zoomBtn = $("#zoomBtn"), torchBtn = $("#torchBtn");
  zoomBtn.hidden = !cam.zoom || cam.zoom.max < 1.5;
  torchBtn.hidden = !cam.torch;
  tools.hidden = zoomBtn.hidden && torchBtn.hidden;
  // Un léger zoom par défaut : on tient le téléphone plus loin, là où il fait la mise au point.
  if (!zoomBtn.hidden) {
    const z = Math.min(2, cam.zoom.max);
    cam.setZoom(z);
    zoomBtn.textContent = "1×";
    zoomBtn.dataset.zoom = String(z);
    zoomBtn.setAttribute("aria-label", "Revenir au zoom 1×");
  }
}

function toggleZoom() {
  if (!cam?.zoom) return;
  const btn = $("#zoomBtn");
  const zoomed = btn.textContent === "1×"; // le bouton affiche l'action suivante
  const z = zoomed ? Math.max(1, cam.zoom.min) : Math.min(2, cam.zoom.max);
  cam.setZoom(z);
  btn.textContent = zoomed ? "2×" : "1×";
  btn.setAttribute("aria-label", zoomed ? "Zoomer 2×" : "Revenir au zoom 1×");
}

function toggleTorch() {
  if (!cam?.torch) return;
  const btn = $("#torchBtn");
  const on = btn.getAttribute("aria-pressed") !== "true";
  cam.setTorch(on);
  btn.setAttribute("aria-pressed", String(on));
}

function focusTap(e) {
  if (!cam || e.target.closest("button")) return;
  const vf = $("#vf");
  const r = vf.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  const ring = $("#focusRing");
  ring.style.left = `${e.clientX - r.left}px`;
  ring.style.top = `${e.clientY - r.top}px`;
  ring.hidden = false;
  ring.classList.remove("pulse"); void ring.offsetWidth; ring.classList.add("pulse");
  if (cam.canFocus) cam.focusAt(x, y);
  setTimeout(() => { ring.hidden = true; }, 900);
}

async function scan() {
  scanUI(true);
  setStatus("");
  try {
    const controls = await startScanner($("#video"), (code) => {
      scanUI(false);
      navigator.vibrate?.(60);
      $("#q").value = code;
      ui.query = code;
      lookupCode(code);
    });
    if (controls) setupCameraTools(controls);
  } catch (e) {
    scanUI(false);
    setStatus(e.message, true);
  }
}

function stopScan() { stopScanner(); scanUI(false); }

// ======================================================================
// Fiche produit
// ======================================================================
const storable = (p) => ({
  id: p.id, code: p.code ?? null, name: p.name, brand: p.brand ?? "", quantity: p.quantity ?? "",
  image: p.image ?? "", nutriscore: p.nutriscore ?? "", serving: p.serving ?? null,
  per100: { ...p.per100 }, ...(p.manual ? { manual: true } : {}),
  ...(p.quality ? { quality: p.quality, nova: p.quality.nova } : p.nova ? { nova: p.nova } : {}),
});

const novaOf = (p) => p?.quality?.nova ?? p?.nova ?? null;
const novaChip = (g) => (g ? `<span class="nova nova-${g}" title="${NOVA[g].desc}">NOVA ${g} · ${NOVA[g].label}</span>` : "");

function qualityBlock(p) {
  if (p.manual) return "";
  const q = p.quality;
  if (!q) return `<section class="quality" id="quality"><p class="muted small">Chargement de la composition…</p></section>`;
  const nova = q.nova;
  const pills = [
    q.organic ? `<span class="tag good">Bio</span>` : "",
    q.palmOil === true ? `<span class="tag bad">Huile de palme</span>` : q.palmOil === false ? `<span class="tag good">Sans huile de palme</span>` : "",
  ].join("");
  return `
    <section class="quality" id="quality">
      <div class="rule-head"><h2>Composition</h2></div>
      ${nova ? `
        <div class="nova-row">
          <span class="nova-scale" aria-hidden="true">${[1, 2, 3, 4].map((g) => `<i class="${g === nova ? `on nova-${g}` : ""}">${g}</i>`).join("")}</span>
          <div class="stack-2"><strong>${NOVA[nova].label}</strong><span class="muted small">${NOVA[nova].desc}</span></div>
        </div>
        ${nova === 4 && q.novaWhy.length ? `<p class="small"><span class="muted">Marqueurs d'ultra-transformation :</span> ${q.novaWhy.map(esc).join(", ")}</p>` : ""}`
      : `<p class="muted small">Degré de transformation (NOVA) non renseigné pour ce produit.</p>`}
      ${pills ? `<div class="chips tight">${pills}</div>` : ""}
      <div class="qline"><span class="eyebrow">Additifs · ${q.additives.length}</span>
        ${q.additives.length ? `<div class="chips tight">${q.additives.map((a) => `<span class="tag">${esc(a)}</span>`).join("")}</div>` : `<span class="small">Aucun additif indiqué</span>`}</div>
      <div class="qline"><span class="eyebrow">Allergènes</span>
        <span class="small">${q.allergens.length ? q.allergens.map(esc).join(", ") : "Aucun allergène indiqué"}</span></div>
      <div class="qline ingr"><span class="eyebrow">Ingrédients</span>
        ${q.ingredients ? `<p class="small">${esc(q.ingredients)}</p>`
          : `<p class="small muted">Liste non renseignée sur Open Food Facts${p.code ? ` · <a href="https://world.openfoodfacts.org/product/${esc(p.code)}" target="_blank" rel="noopener">voir la fiche</a>` : ""}.</p>`}
      </div>
    </section>`;
}

// Produit enregistré avant cette version, ou trouvé par recherche : on complète en arrière-plan.
async function ensureQuality(id) {
  const p = findProduct(id);
  if (!p || p.manual || p.quality?.v === QUALITY_VERSION || !p.code) return;
  try {
    const full = await off.getByCode(p.code);
    if (!full) throw new Error();
    cache.set(id, { ...p, ...full });
    if (store.getState().products[id]) {
      store.update((s) => { s.products[id] = { ...s.products[id], quality: full.quality, nova: full.quality.nova }; });
    }
    const box = $("#quality", sheet);
    if (sheet.open && box) {
      box.outerHTML = qualityBlock({ ...p, quality: full.quality });
      $("#novaHead", sheet)?.replaceChildren();
      $("#novaHead", sheet)?.insertAdjacentHTML("beforeend", novaChip(full.quality.nova));
    }
  } catch {
    const box = $("#quality", sheet);
    if (box) box.innerHTML = `<p class="muted small">Composition indisponible hors connexion.</p>`;
  }
}

function mealNameFor(choice) {
  const m = store.getDay(ui.date).meals.find((x) => x.id === choice);
  return m ? m.name : suggestMealName(defaultTime());
}

function openProduct(id) {
  const p = findProduct(id);
  if (!p) return;
  const stored = store.getState().products[id];
  const qty0 = stored?.lastQty ?? p.serving ?? 100;
  const dayWord = relLabel(ui.date).toLowerCase();

  openSheet(`
    <div class="phead">
      ${thumb(p, true)}
      <div class="phead-text">
        <h2 class="display">${esc(p.name)}</h2>
        <span class="muted small">${esc([p.brand, p.quantity].filter(Boolean).join(" · ")) || (p.manual ? "Recette perso" : "")}</span>
        <span class="chips tight">${nutriChip(p.nutriscore)}<span id="novaHead">${novaChip(novaOf(p))}</span></span>
      </div>
      <button type="button" class="iconbtn" id="starBtn" data-act="toggle-save" data-id="${esc(id)}"
        aria-pressed="${!!stored?.saved}" aria-label="Enregistrer le produit">${stored?.saved ? ICON.starFill : ICON.star}</button>
    </div>
    ${qtyBlock(qty0, qtyPresets(p, stored))}
    <div class="result" id="preview"></div>
    ${mealPicker(ui.mealId, `Repas · ${dayWord}`)}
    <button value="add" class="cta" id="cta">Ajouter</button>
    ${qualityBlock(p)}
    ${nutritionLabel(p)}
    ${p.code && !p.manual ? `<p class="muted small center"><a href="https://world.openfoodfacts.org/product/${esc(p.code)}" target="_blank" rel="noopener">Voir sur Open Food Facts</a></p>` : ""}
  `, (_, fd) => {
    const qty = num(fd.get("qty"));
    if (!qty || qty <= 0) return false;
    addEntry(p, qty, fd.get("meal"));
  });

  sheet.onPreview = () => {
    const q = num($("#f-qty", sheet).value) ?? 0;
    $("#preview", sheet).innerHTML = resultGrid(scale(p.per100, q));
    sheet.querySelectorAll("[data-set-qty]").forEach((c) => c.classList.toggle("on", num(c.dataset.setQty) === q));
    const choice = new FormData($("form", sheet)).get("meal");
    $("#cta", sheet).textContent = `Ajouter ${toMeal(mealNameFor(choice))}`;
  };
  sheet.onPreview();
  ensureQuality(id);
}

function addEntry(p, qty, mealChoice) {
  let mealName = "";
  store.update((s) => {
    const d = store.ensureDay(s, ui.date);
    let meal = d.meals.find((m) => m.id === mealChoice);
    if (!meal) {
      const time = defaultTime();
      meal = { id: uid(), name: suggestMealName(time), time, entries: [] };
      d.meals.push(meal);
    }
    ui.mealId = meal.id;
    mealName = meal.name;
    meal.entries.push({ id: uid(), productId: p.id, name: p.name, brand: p.brand ?? "", qty, per100: { ...p.per100 } });
    const cur = s.products[p.id];
    const fresh = cache.get(p.id) ?? p; // peut avoir été complété en arrière-plan
    const quality = fresh.quality ?? cur?.quality;
    s.products[p.id] = { ...storable({ ...fresh, ...(quality ? { quality } : {}) }), saved: cur?.saved ?? false, lastUsed: Date.now(), lastQty: qty };
  });
  toast(`${p.name} · ${fmt(qty)} g ajouté ${toMeal(mealName)}`);
}

function quickAdd(id) {
  const p = findProduct(id);
  if (p) addEntry(p, quickQty(p), ui.mealId);
}

function toggleSave(id) {
  const p = findProduct(id);
  if (!p) return;
  store.update((s) => {
    const cur = s.products[id];
    s.products[id] = { ...(cur ?? storable(p)), saved: !cur?.saved };
  });
  const saved = !!store.getState().products[id]?.saved;
  const btn = $("#starBtn", sheet);
  if (btn) { btn.innerHTML = saved ? ICON.starFill : ICON.star; btn.setAttribute("aria-pressed", saved); }
}

// ======================================================================
// Repas, entrées, activités
// ======================================================================
// Pas de formulaire : on va direct à l'ajout d'aliments. Le repas (nom
// suggéré selon l'heure) n'est créé qu'au premier aliment ajouté, donc
// pas de repas vide si on revient en arrière. Renommer : bouton ⋯.
function newMeal() {
  ui.mealId = null;
  ui.results = null;
  ui.query = "";
  go("add");
}

function deleteMeal(mealId) {
  const date = ui.date;
  const day = store.getDay(date);
  const meal = day.meals.find((m) => m.id === mealId);
  if (!meal) return;
  const backup = JSON.parse(JSON.stringify(meal));
  store.update((s) => {
    const d = store.ensureDay(s, date);
    d.meals = d.meals.filter((m) => m.id !== mealId);
    store.pruneDay(s, date);
  });
  toast(`${meal.name} supprimé`, {
    label: "Annuler",
    run: () => store.update((s) => { store.ensureDay(s, date).meals.push(backup); }),
  });
}

function editMeal(mealId) {
  const meal = store.getDay(ui.date).meals.find((m) => m.id === mealId);
  if (!meal) return;
  openSheet(`
    <h2 class="sheet-title">Modifier le repas</h2>
    <label class="flabel">Nom<input name="name" id="f-name" required maxlength="40" value="${esc(meal.name)}"></label>
    <label class="flabel">Heure<input name="time" id="f-time" type="time" required value="${meal.time}"></label>
    <button value="ok" class="cta">Enregistrer</button>
    <button value="delete" class="btn-outline danger wide" formnovalidate>${ICON.trash}Supprimer le repas${meal.entries.length ? ` (${meal.entries.length} aliment${meal.entries.length > 1 ? "s" : ""})` : ""}</button>`,
  (action, fd) => {
    if (action === "delete") return deleteMeal(mealId);
    store.update((s) => {
      const m = store.ensureDay(s, ui.date).meals.find((x) => x.id === mealId);
      m.name = fd.get("name").trim();
      m.time = fd.get("time");
    });
  });
}

function editEntry(mealId, entryId) {
  const meal = store.getDay(ui.date).meals.find((m) => m.id === mealId);
  const e = meal?.entries.find((x) => x.id === entryId);
  if (!e) return;
  const prod = store.getState().products[e.productId];
  openSheet(`
    <div class="phead">
      ${thumb(prod ?? { name: e.name })}
      <div class="phead-text">
        <h2 class="display">${esc(e.name)}</h2>
        <span class="muted small num">${esc(e.brand)}${e.brand ? " · " : ""}${fmt(e.per100.kcal)} kcal / 100 g</span>
      </div>
    </div>
    ${qtyBlock(e.qty, qtyPresets(prod ?? { per100: e.per100 }, null))}
    <div class="result" id="preview"></div>
    ${mealPicker(mealId, "Repas", false)}
    <div class="sheet-actions">
      <button value="delete" class="btn-outline danger" formnovalidate>Retirer</button>
      <button value="ok" class="cta">Enregistrer</button>
    </div>`, (action, fd) => {
    store.update((s) => {
      const d = store.ensureDay(s, ui.date);
      const from = d.meals.find((m) => m.id === mealId);
      const entry = from.entries.find((x) => x.id === entryId);
      from.entries = from.entries.filter((x) => x.id !== entryId);
      if (action === "delete") return;
      entry.qty = num(fd.get("qty")) ?? entry.qty;
      (d.meals.find((m) => m.id === fd.get("meal")) ?? from).entries.push(entry);
    });
  });
  sheet.onPreview = () => {
    const q = num($("#f-qty", sheet).value) ?? 0;
    $("#preview", sheet).innerHTML = resultGrid(scale(e.per100, q));
    sheet.querySelectorAll("[data-set-qty]").forEach((c) => c.classList.toggle("on", num(c.dataset.setQty) === q));
  };
  sheet.onPreview();
}

function editActivity(id) {
  const s = store.getState();
  const a = id ? store.getDay(ui.date).activities.find((x) => x.id === id) : null;
  const weight = s.profile?.weight ?? null;
  // Une activité d'avant le calcul auto n'a pas de type : saisie libre.
  const type0 = a ? (a.type ?? OTHER) : (activityInfo(s.lastActivity) ? s.lastActivity : "run-10");
  let manual = a ? (a.manual ?? true) : false;

  const options = ACTIVITY_GROUPS.map(([group, items]) =>
    `<optgroup label="${group}">${items.map(([k, label]) =>
      `<option value="${k}"${k === type0 ? " selected" : ""}>${label}</option>`).join("")}</optgroup>`).join("") +
    `<option value="${OTHER}"${type0 === OTHER ? " selected" : ""}>Autre (saisie libre)</option>`;

  openSheet(`
    <h2 class="sheet-title">${a ? "Modifier l'activité" : "Nouvelle activité"}</h2>
    <label class="flabel">Activité
      <span class="selectwrap"><select name="type" id="f-atype">${options}</select>${ICON.down}</span>
    </label>
    <label class="flabel" id="f-aname-wrap"${type0 === OTHER ? "" : " hidden"}>Nom
      <input name="name" id="f-aname" maxlength="40" placeholder="Paddle, ménage, jardinage…" value="${type0 === OTHER ? esc(a?.name ?? "") : ""}">
    </label>
    <div class="grid2">
      <label class="flabel">Durée (min)<input name="minutes" id="f-min" inputmode="numeric" required value="${a?.minutes ?? 30}"></label>
      <label class="flabel">Calories brûlées<input name="kcal" id="f-akcal" inputmode="numeric" required value="${a?.kcal ?? ""}"></label>
    </div>
    <p class="muted small kcal-hint" id="kcalHint"></p>
    <div class="sheet-actions">
      ${a ? `<button value="delete" class="btn-outline danger" formnovalidate>Supprimer</button>`
          : `<button value="cancel" class="btn-outline" formnovalidate>Annuler</button>`}
      <button value="ok" class="cta">Enregistrer</button>
    </div>`, (action, fd) => {
    store.update((st) => {
      const d = store.ensureDay(st, ui.date);
      if (action === "delete") {
        d.activities = d.activities.filter((x) => x.id !== id);
        return store.pruneDay(st, ui.date);
      }
      const type = fd.get("type");
      const name = type === OTHER ? fd.get("name").trim() : activityInfo(type).label;
      const data = { type, name, minutes: num(fd.get("minutes")) ?? 0, kcal: num(fd.get("kcal")) ?? 0, manual };
      if (a) Object.assign(d.activities.find((x) => x.id === id), data);
      else d.activities.push({ id: uid(), ...data });
      if (type !== OTHER) st.lastActivity = type;
    });
  });

  const typeEl = $("#f-atype", sheet), minEl = $("#f-min", sheet), kcalEl = $("#f-akcal", sheet);
  const nameWrap = $("#f-aname-wrap", sheet), nameEl = $("#f-aname", sheet), hint = $("#kcalHint", sheet);

  // Toucher au chiffre = valeur forcée ; ce listener passe avant celui de la feuille.
  kcalEl.addEventListener("input", () => { manual = true; });

  sheet.onPreview = () => {
    const type = typeEl.value;
    const other = type === OTHER;
    nameWrap.hidden = !other;
    nameEl.required = other;
    const minutes = num(minEl.value);
    const calc = other ? null : activityKcal(type, weight, minutes);
    if (!manual && calc != null) kcalEl.value = calc;

    if (other) {
      hint.textContent = "Activité libre : indique les calories toi-même.";
    } else if (!weight) {
      hint.innerHTML = `Pour le calcul automatique, indique ton poids. <button type="button" class="linkish accent" id="goWeight">Aller aux réglages</button>`;
    } else if (manual && calc != null && num(kcalEl.value) !== calc) {
      hint.innerHTML = `Valeur saisie à la main. <button type="button" class="linkish accent" id="recalc">Recalculer (${fmt(calc)} kcal)</button>`;
    } else {
      const met = activityInfo(type).met;
      hint.textContent = `Estimation : ${fmt(met, 1)} MET × ${fmt(weight, 1)} kg × ${fmt(minutes ?? 0)} min, hors métabolisme de repos. Tu peux modifier le chiffre.`;
    }
  };

  hint.addEventListener("click", (e) => {
    if (e.target.id === "recalc") { manual = false; sheet.onPreview(); }
    if (e.target.id === "goWeight") { sheet.close(); go("settings"); setTimeout(() => $("#p-weight")?.focus(), 50); }
  });
  sheet.onPreview();
}

// ======================================================================
// Produits
// ======================================================================
function renderProducts() {
  view.innerHTML = `
    <header class="titlebar">
      <h1 class="title">Produits</h1>
      <button class="btn-ink" data-act="new-product">+ Créer</button>
    </header>
    <label class="field" for="pfilter">${ICON.search}
      <input type="search" id="pfilter" placeholder="Filtrer mes produits" aria-label="Filtrer mes produits" value="${esc(ui.pfilter)}">
    </label>
    <div id="plists" class="stack-12"></div>`;
  renderPLists();
}

function renderPLists() {
  const el = $("#plists");
  if (!el) return;
  const f = ui.pfilter.trim().toLowerCase();
  const all = Object.values(store.getState().products);
  const match = (p) => !f || `${p.name} ${p.brand}`.toLowerCase().includes(f);
  const saved = all.filter((p) => p.saved);
  const used = all.filter((p) => !p.saved);
  const list = (ui.ptab === "saved" ? saved : used).filter(match)
    .sort(ui.ptab === "saved" ? (a, b) => a.name.localeCompare(b.name, "fr") : (a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0));
  const sub = (p) => p.manual
    ? ["Recette perso", p.serving ? `portion ${fmt(p.serving)} g` : ""].filter(Boolean).join(" · ")
    : [p.brand, p.quantity].filter(Boolean).join(" · ");
  el.innerHTML =
    seg("ptab", [["saved", `Enregistrés · ${saved.length}`], ["used", `Déjà utilisés · ${used.length}`]], ui.ptab) +
    (list.length ? `<div class="card plist">${list.map((p) => `
      <button class="plrow" data-act="open-product" data-id="${esc(p.id)}">
        ${thumb(p)}
        <span class="prow-text"><span class="pname">${esc(p.name)}</span><small>${esc(sub(p))}</small></span>
        <span class="kcal100 num">${fmt(p.per100.kcal)}<small>kcal/100 g</small></span>
      </button>`).join("")}</div>`
      : `<p class="muted small empty">${f ? "Aucun produit ne correspond."
        : ui.ptab === "saved" ? "Aucun produit enregistré. Crée un plat maison avec « + Créer », ou touche l'étoile sur une fiche produit."
        : "Les produits que tu ajoutes à tes repas apparaîtront ici."}</p>`);
}

function newProduct() {
  const fields = [["kcal", "Calories (kcal)"], ["prot", "Protéines (g)"], ["carbs", "Glucides (g)"], ["fat", "Lipides (g)"], ["fiber", "Fibres (g)"]];
  openSheet(`
    <h2 class="sheet-title">Créer un produit</h2>
    <label class="flabel">Nom<input name="name" id="f-pname" required maxlength="60" placeholder="Lasagnes maison"></label>
    <label class="flabel">Marque ou note (facultatif)<input name="brand" id="f-pbrand" maxlength="40"></label>
    <span class="eyebrow">Valeurs pour 100 g</span>
    <div class="grid2">${fields.map(([k, l]) =>
      `<label class="flabel">${l}<input name="${k}" id="f-p${k}" inputmode="decimal"${k === "kcal" ? " required" : ""}></label>`).join("")}
      <label class="flabel">Portion (g)<input name="serving" id="f-pserving" inputmode="decimal" placeholder="Facultatif"></label>
    </div>
    <div class="sheet-actions">
      <button value="cancel" class="btn-outline" formnovalidate>Annuler</button>
      <button value="ok" class="cta">Créer</button>
    </div>`, (_, fd) => {
    const id = "m-" + uid();
    const per100 = Object.fromEntries(NUTRIENTS.map((n) => [n.key, num(fd.get(n.key))]));
    store.update((s) => {
      s.products[id] = {
        ...storable({ id, name: fd.get("name").trim(), brand: fd.get("brand").trim(), serving: num(fd.get("serving")), per100, manual: true }),
        saved: true,
      };
    });
    ui.ptab = "saved";
    toast("Produit créé");
  });
}

// ======================================================================
// Réglages
// ======================================================================
function renderSettings() {
  const s = store.getState();
  const g = s.goals;
  const rows = [["kcal", "Calories", "kcal", ""], ...MACROS.map((m) => [m.key, m.label, "g", m.key])];
  view.innerHTML = `
    <header class="pushed">
      <button class="back" data-act="back-day">${ICON.prev}Journée</button>
      <h1 class="title">Réglages</h1>
    </header>
    <section class="card">
      ${ruleHead("Profil")}
      <div class="goal">
        <label for="p-weight">Poids</label>
        <span class="goal-in"><input id="p-weight" inputmode="decimal" placeholder="—" value="${s.profile?.weight ?? ""}"><span>kg</span></span>
      </div>
      <p class="muted small note">Sert à estimer les calories de tes activités.</p>
    </section>
    <form class="card" id="goalsForm">
      ${ruleHead("Objectifs par jour")}
      ${rows.map(([k, l, u, tone]) => `
        <div class="goal">
          <label for="g-${k}">${tone ? `<i class="dot tone-${tone}"></i>` : ""}${l}</label>
          <span class="goal-in"><input id="g-${k}" name="${k}" inputmode="numeric" value="${g[k] ?? ""}"><span>${u}</span></span>
        </div>`).join("")}
      <p class="muted small note">Laisse un champ vide pour ne pas suivre ce nutriment. Les calories du sport s'ajoutent au budget du jour.</p>
      <button class="cta">Enregistrer les objectifs</button>
    </form>
    <section class="card stack-12" id="installCard">${installCardInner()}</section>
    <section class="card stack-12">
      ${ruleHead("Sauvegarde")}
      <p>Tout est stocké sur ce téléphone, rien n'est envoyé ailleurs.</p>
      <div class="hstack between">
        <span class="num small muted">${Object.keys(s.products).length} produits · ${Object.keys(s.days).length} jours · ${store.sizeKb()} Ko</span>
        <span class="pill" id="persist">…</span>
      </div>
      <div class="grid2">
        <button class="btn-outline" data-act="export">Exporter</button>
        <label class="btn-outline" for="importFile">Importer</label>
      </div>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
      <button class="textbtn danger" data-act="wipe">Tout effacer…</button>
    </section>
    <p class="muted small center">Données produits : <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a>, licence ODbL<br><span class="num">Version ${VERSION}</span></p>`;
  store.requestPersist().then((ok) => {
    const el = $("#persist");
    if (!el) return;
    el.classList.add(ok ? "ok" : "warn");
    el.innerHTML = `<i></i>${ok ? "Stockage persistant" : "Non garanti : ajoute l'appli à l'écran d'accueil"}`;
  });
}

function exportBackup() {
  const blob = new Blob([store.exportData()], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `carnet-${todayKey()}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importBackup(file) {
  file.text().then((text) => {
    openSheet(`
      <h2 class="sheet-title">Importer la sauvegarde ?</h2>
      <p>Les données de ce téléphone seront remplacées par celles de <strong>${esc(file.name)}</strong>.</p>
      <div class="sheet-actions"><button value="cancel" class="btn-outline" formnovalidate>Annuler</button><button value="ok" class="cta">Remplacer</button></div>`,
    () => {
      try { store.importData(text); toast("Sauvegarde importée"); }
      catch (e) { toast(e.message.startsWith("Ce fichier") ? e.message : "Fichier illisible."); }
    });
  });
}

function confirmWipe() {
  openSheet(`
    <h2 class="sheet-title">Tout effacer ?</h2>
    <p>Repas, activités, produits et objectifs seront supprimés de ce téléphone. Exporte une sauvegarde avant si tu veux les garder.</p>
    <div class="sheet-actions"><button value="cancel" class="btn-outline" formnovalidate>Annuler</button><button value="ok" class="cta danger-fill">Tout effacer</button></div>`,
  () => { store.wipe(); toast("Données effacées"); });
}

// ======================================================================
// Feuille modale et toast
// ======================================================================
function openSheet(html, onSubmit) {
  sheet.onPreview = null;
  sheet.innerHTML = `<form method="dialog" class="sheet-body">
    <div class="sheet-top"><span class="grab" aria-hidden="true"></span>
      <button value="cancel" class="close" formnovalidate aria-label="Fermer">${ICON.close}</button></div>${html}</form>`;
  const form = $("form", sheet);
  form.addEventListener("submit", (e) => {
    const action = e.submitter?.value ?? "ok";
    if (action === "cancel") return; // fermeture native
    e.preventDefault();
    if (action !== "delete" && !form.reportValidity()) return;
    if (onSubmit(action, new FormData(form), form) !== false) sheet.close();
  });
  sheet.showModal();
  sheet.scrollTop = 0;
}

sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });

// Glisser vers le bas pour fermer : depuis la poignée, ou n'importe où
// quand la feuille est déjà en haut de son défilement.
(() => {
  let startY = 0, lastY = 0, lastT = 0, speed = 0, dragging = false, armed = false;
  const reset = () => { sheet.style.transition = ""; sheet.style.transform = ""; };

  sheet.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || e.target.closest("input, select, textarea")) { armed = false; return; }
    armed = sheet.scrollTop <= 0 || !!e.target.closest(".sheet-top");
    dragging = false;
    startY = lastY = e.touches[0].clientY;
    lastT = e.timeStamp;
    speed = 0;
  }, { passive: true });

  sheet.addEventListener("touchmove", (e) => {
    if (!armed) return;
    const y = e.touches[0].clientY;
    const dy = y - startY;
    if (!dragging) {
      if (dy < 6) { if (dy < -6) armed = false; return; } // vers le haut : défilement normal
      dragging = true;
      sheet.style.transition = "none";
    }
    e.preventDefault();
    speed = (y - lastY) / Math.max(1, e.timeStamp - lastT);
    lastY = y;
    lastT = e.timeStamp;
    sheet.style.transform = `translateY(${Math.max(0, dy)}px)`;
  }, { passive: false });

  const end = () => {
    if (!dragging) return;
    dragging = armed = false;
    const dy = lastY - startY;
    sheet.style.transition = "transform .2s ease-out";
    if (dy > 110 || (dy > 30 && speed > 0.6)) {
      sheet.style.transform = "translateY(100%)";
      setTimeout(() => { sheet.close(); reset(); }, 190);
    } else {
      sheet.style.transform = "translateY(0)";
      setTimeout(reset, 210);
    }
  };
  sheet.addEventListener("touchend", end);
  sheet.addEventListener("touchcancel", end);
  sheet.addEventListener("close", reset);
})();
sheet.addEventListener("input", () => sheet.onPreview?.());

let toastTimer;
let toastAction = null;
function toast(msg, action = null) {
  const el = $("#toast");
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button" id="toastBtn">${esc(action.label)}</button>` : ""}`;
  toastAction = action;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; toastAction = null; }, action ? 6000 : 2600);
}
$("#toast").addEventListener("click", (e) => {
  if (e.target.id !== "toastBtn" || !toastAction) return;
  const run = toastAction.run;
  toastAction = null;
  $("#toast").hidden = true;
  run();
});

// Résultat de recherche : on recharge la fiche complète (valeurs nutritionnelles, photo).
async function openFromSearch(id) {
  if (store.getState().products[id]) return openProduct(id);
  setStatus("Chargement de la fiche…");
  try {
    const p = await off.getByCode(id);
    if (p) cache.set(id, p);
    setStatus("");
  } catch (e) {
    if (cache.get(id)?.per100.kcal == null) return setStatus(e.message, true);
    setStatus("");
  }
  if (cache.get(id)?.per100.kcal == null) return setStatus("Ce produit n'a pas de valeurs nutritionnelles sur Open Food Facts.", true);
  openProduct(id);
}

// ======================================================================
// Événements
// ======================================================================
const actions = {
  "prev-day": () => { ui.date = addDays(ui.date, -1); render(); },
  "next-day": () => { ui.date = addDays(ui.date, 1); render(); },
  today: () => { if (ui.date !== todayKey()) { ui.date = todayKey(); render(); } },
  calendar: openCalendar,
  "cal-month": (d) => calMonthStep(d.dir),
  "cal-pick": (d) => calPick(d.day),
  "cal-today": () => calPick(todayKey()),
  settings: () => go("settings"),
  "back-day": () => go("day"),
  "new-meal": newMeal,
  "edit-meal": (d) => editMeal(d.meal),
  "add-to-meal": (d) => { ui.mealId = d.meal; ui.results = null; ui.query = ""; go("add"); },
  "edit-entry": (d) => editEntry(d.meal, d.entry),
  "new-activity": () => editActivity(null),
  "edit-activity": (d) => editActivity(d.id),
  scan,
  "stop-scan": () => { stopScan(); setStatus(""); },
  "cam-zoom": toggleZoom,
  "cam-torch": toggleTorch,
  "open-product": (d) => (ui.view === "add" && ui.results ? openFromSearch(d.id) : openProduct(d.id)),
  "quick-add": (d) => quickAdd(d.id),
  "toggle-save": (d) => toggleSave(d.id),
  tab: (d) => { ui[d.group] = d.tab; d.group === "ptab" ? renderPLists() : renderResults(); },
  "new-product": newProduct,
  export: exportBackup,
  wipe: confirmWipe,
  install,
  "dismiss-install": () => { try { localStorage.setItem("carnet:installBanner", "off"); } catch {} render(); },
};

document.addEventListener("click", (e) => {
  if (e.target.closest("#vf.live")) focusTap(e);
  const b = e.target.closest("[data-nav],[data-act],[data-set-qty],[data-step]");
  if (!b) return;
  if (b.dataset.nav) {
    if (sheet.open) sheet.close();
    if (b.dataset.nav === "add" && ui.view !== "add") { ui.results = null; ui.query = ""; }
    return go(b.dataset.nav);
  }
  if (b.dataset.setQty || b.dataset.step) {
    const input = $("#f-qty", sheet);
    input.value = b.dataset.setQty ?? Math.max(0, Math.round((num(input.value) ?? 0) + Number(b.dataset.step)));
    return sheet.onPreview?.();
  }
  actions[b.dataset.act]?.(b.dataset, b);
});

document.addEventListener("submit", (e) => {
  if (e.target.id === "searchForm") {
    e.preventDefault();
    stopScan();
    $("#q").blur();
    doSearch($("#q").value);
  } else if (e.target.id === "goalsForm") {
    e.preventDefault();
    const fd = new FormData(e.target);
    store.update((s) => { for (const k of ["kcal", "prot", "carbs", "fat", "fiber"]) s.goals[k] = num(fd.get(k)); });
    toast("Objectifs enregistrés");
  }
});

document.addEventListener("input", (e) => {
  if (e.target.id === "q" && !e.target.value) { ui.query = ""; ui.results = null; setStatus(""); renderResults(); }
  if (e.target.id === "pfilter") { ui.pfilter = e.target.value; renderPLists(); }
});

document.addEventListener("change", (e) => {
  if (e.target.id === "mealSel") ui.mealId = e.target.value || null;
  if (e.target.id === "p-weight") {
    const w = num(e.target.value);
    store.update((s) => { s.profile = { ...s.profile, weight: w && w > 0 ? w : null }; });
    toast(w ? "Poids enregistré" : "Poids effacé");
  }
  if (e.target.id === "importFile" && e.target.files[0]) { importBackup(e.target.files[0]); e.target.value = ""; }
});

// Rouvrir l'appli le lendemain : « aujourd'hui » suit la date.
let lastToday = todayKey();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") return stopScan();
  const t = todayKey();
  if (t !== lastToday) {
    if (ui.date === lastToday) ui.date = t;
    lastToday = t;
    if (ui.view === "day") render();
  }
});

// ======================================================================
// Installation (PWA)
// ======================================================================
let installPrompt = window.__installPrompt ?? null; // beforeinstallprompt (Chrome, Edge, Samsung…)
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isIOSSafari = () => isIOS() && !/crios|fxios|edgios/i.test(navigator.userAgent);

function installState() {
  if (isStandalone()) return "installed";
  if (installPrompt) return "prompt";
  if (isIOS()) return "ios";
  return "manual"; // pas de proposition du navigateur : on explique le menu

}

const bannerDismissed = () => { try { return localStorage.getItem("carnet:installBanner") === "off"; } catch { return false; } };

function installBanner() {
  const st = installState();
  if (st === "installed" || bannerDismissed()) return "";
  return `
    <section class="install-banner">
      <img src="icons/icon-192.png" alt="" width="40" height="40">
      <div class="stack-2 grow"><strong>Installer Carnet</strong><span class="small muted">Sur ton écran d'accueil, comme une vraie appli, même hors ligne.</span></div>
      <button class="btn-ink small-btn" data-act="install">Installer</button>
      <button class="iconbtn bare" data-act="dismiss-install" aria-label="Masquer">${ICON.close}</button>
    </section>`;
}

function installCardInner() {
  const st = installState();
  const body = {
    installed: `<p class="hstack"><span class="pill ok"><i></i>Installée sur cet appareil</span></p>`,
    prompt: `<p>Ajoute Carnet à ton écran d'accueil : icône, plein écran, ouverture même hors ligne.</p>
      <button class="cta" data-act="install">Installer l'application</button>`,
    ios: `<p>Ajoute Carnet à ton écran d'accueil : icône, plein écran, ouverture même hors ligne, et tes données sont protégées de l'effacement automatique de Safari.</p>
      <button class="cta" data-act="install">Installer sur l'iPhone</button>`,
    manual: `<p>Ajoute Carnet à ton écran d'accueil : icône, plein écran, ouverture même hors ligne.</p>
      <button class="cta" data-act="install">Installer l'application</button>`,
  }[st];
  return `${ruleHead("Application")}${body}`;
}

function refreshInstallUI() {
  const card = $("#installCard");
  if (card) card.innerHTML = installCardInner();
  if (ui.view === "day") render();
}

function iosInstallSheet() {
  const share = `<svg viewBox="0 0 24 24" aria-hidden="true" class="inline-ic"><path d="M12 3v12M8 7l4-4 4 4M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/></svg>`;
  openSheet(`
    <h2 class="sheet-title">Installer sur l'iPhone</h2>
    ${isIOSSafari() ? "" : `<p class="small warn-note">Ouvre d'abord cette page dans <strong>Safari</strong> si l'option n'apparaît pas dans ce navigateur.</p>`}
    <ol class="steps">
      <li>Touche le bouton <strong>Partager</strong> ${share} en bas de Safari (ou en haut sur iPad).</li>
      <li>Fais défiler et choisis <strong>Sur l'écran d'accueil</strong>.</li>
      <li>Touche <strong>Ajouter</strong>. Carnet apparaît avec son icône.</li>
    </ol>
    <p class="muted small">Ouvre ensuite Carnet depuis l'icône : tes données restent sur ce téléphone.</p>
    <button value="ok" class="cta">J'ai compris</button>`, () => {});
}

function manualInstallSheet() {
  const dots = `<svg viewBox="0 0 24 24" aria-hidden="true" class="inline-ic"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>`;
  openSheet(`
    <h2 class="sheet-title">Installer l'application</h2>
    <ol class="steps">
      <li>Ouvre le menu du navigateur ${dots} (en haut à droite dans Chrome).</li>
      <li>Choisis <strong>Installer l'application</strong> ou <strong>Ajouter à l'écran d'accueil</strong>.</li>
      <li>Confirme. Carnet apparaît avec son icône.</li>
    </ol>
    <p class="muted small">Si l'option n'apparaît pas, l'appli est peut-être déjà installée : cherche l'icône Carnet sur ton écran d'accueil. Sur Firefox, l'option s'appelle « Installer » ou « Ajouter à l'écran d'accueil ».</p>
    <button value="ok" class="cta">J'ai compris</button>`, () => {});
}

async function install() {
  const st = installState();
  if (st === "ios") return iosInstallSheet();
  if (st === "manual") return manualInstallSheet();
  if (st !== "prompt") return;
  installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  installPrompt = window.__installPrompt = null;
  if (outcome !== "accepted") toast("Installation annulée");
  refreshInstallUI();
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); // on garde la proposition pour notre bouton
  installPrompt = window.__installPrompt = e;
  refreshInstallUI();
});
window.addEventListener("appinstalled", () => {
  installPrompt = null;
  toast("Carnet est installé");
  refreshInstallUI();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service worker non enregistré", e));
}

store.requestPersist();
render();
