import * as store from "./store.js";
import * as off from "./off.js";
import { startScanner, stopScanner } from "./scanner.js";
import {
  NUTRIENTS, MACROS, esc, num, fmt, uid, scale, entryTotals, mealTotals, dayTotals,
  burnedKcal, sortMeals, todayKey, addDays, dayLabel, nowTime, suggestMealName,
} from "./util.js";

const $ = (s, root = document) => root.querySelector(s);
const view = $("#view");
const sheet = $("#sheet");

const ui = {
  view: "day",
  date: todayKey(),
  mealId: null,     // repas cible pour les ajouts
  query: "",
  results: null,    // résultats de recherche (null = afficher récents/enregistrés)
  pfilter: "",
};
const cache = new Map(); // produits vus en recherche, pas encore stockés

const findProduct = (id) => store.getState().products[id] ?? cache.get(id);
const defaultTime = () => (ui.date === todayKey() ? nowTime() : "12:00");

// ======================================================================
// Navigation et rendu
// ======================================================================
function go(v) {
  if (ui.view === "add" && v !== "add") stopScan();
  ui.view = v;
  render();
  window.scrollTo(0, 0);
}

function render() {
  document.querySelectorAll("[data-nav]").forEach((b) =>
    b.setAttribute("aria-current", b.dataset.nav === ui.view ? "page" : "false"));
  ({ day: renderDay, add: renderAdd, products: renderProducts, settings: renderSettings })[ui.view]();
}

// Sur la vue Ajouter, on ne redessine pas tout (la caméra tourne peut-être).
store.subscribe(() => {
  if (ui.view === "add") { renderTarget(); renderResults(); }
  else if (ui.view === "products") renderPLists();
  else render();
});

const bar = (value, goal) => {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  return `<div class="bar${goal > 0 && value > goal ? " over" : ""}"><i style="width:${pct}%"></i></div>`;
};

const nutriChip = (g) => (g ? `<span class="chip ns-${g}">Nutri-Score ${g.toUpperCase()}</span>` : "");

// ======================================================================
// Vue Journée
// ======================================================================
function renderDay() {
  const s = store.getState();
  const g = s.goals;
  const day = store.getDay(ui.date);
  const t = dayTotals(day);
  const burned = burnedKcal(day);
  const budget = (g.kcal ?? 0) + burned;
  const left = budget - t.kcal;

  const summary = g.kcal
    ? `<section class="card summary">
        <div class="big"><span class="num">${fmt(Math.abs(left))}</span>
          <span>kcal ${left >= 0 ? "restantes" : "en trop"}</span></div>
        <p class="eq num">${fmt(g.kcal)} objectif + ${fmt(burned)} sport − ${fmt(t.kcal)} mangées</p>
        ${bar(t.kcal, budget)}
        <div class="macros">${MACROS.filter((m) => g[m.key]).map((m) => `
          <div><div class="mlabel"><span>${m.label}</span>
            <span class="num">${fmt(t[m.key])} / ${fmt(g[m.key])} g</span></div>
            ${bar(t[m.key], g[m.key])}</div>`).join("")}
        </div>
      </section>`
    : `<section class="card summary"><div class="big"><span class="num">${fmt(t.kcal)}</span><span>kcal mangées</span></div>
        <p class="eq">Aucun objectif défini. <button class="linkish" data-nav="settings">Définir mes objectifs</button></p></section>`;

  const meals = sortMeals(day.meals).map((m) => {
    const mt = mealTotals(m);
    return `<article class="card meal">
      <header class="mhead">
        <button class="linkish" data-act="edit-meal" data-meal="${m.id}"><strong>${esc(m.name)}</strong> <span class="muted num">${m.time}</span></button>
        <span class="num">${fmt(mt.kcal)} kcal</span>
      </header>
      ${m.entries.length ? `<ul class="entries">${m.entries.map((e) => `
        <li><button data-act="edit-entry" data-meal="${m.id}" data-entry="${e.id}">
          <span class="ename">${esc(e.name)}<small class="num">${fmt(e.qty)} g · ${fmt(entryTotals(e).prot, 1)} g prot.</small></span>
          <span class="num">${fmt(entryTotals(e).kcal)}</span></button></li>`).join("")}</ul>`
        : `<p class="muted empty">Aucun aliment pour l'instant.</p>`}
      <button class="ghost small" data-act="add-to-meal" data-meal="${m.id}">+ Aliment</button>
    </article>`;
  }).join("");

  view.innerHTML = `
    <header class="daybar">
      <button class="icon" data-act="prev-day" aria-label="Jour précédent">‹</button>
      <button class="linkish daytitle" data-act="today" title="Revenir à aujourd'hui"><h1>${dayLabel(ui.date)}</h1></button>
      <button class="icon" data-act="next-day" aria-label="Jour suivant">›</button>
    </header>
    ${summary}
    ${meals || `<p class="muted empty">Aucun repas ce jour-là.</p>`}
    <button data-act="new-meal">+ Nouveau repas</button>
    <section class="card">
      <header class="mhead"><strong>Activités</strong><span class="num">${burned ? "+" + fmt(burned) + " kcal" : ""}</span></header>
      ${day.activities.length ? `<ul class="entries">${day.activities.map((a) => `
        <li><button data-act="edit-activity" data-id="${a.id}">
          <span class="ename">${esc(a.name)}<small class="num">${fmt(a.minutes)} min</small></span>
          <span class="num">+${fmt(a.kcal)}</span></button></li>`).join("")}</ul>` : ""}
      <button class="ghost small" data-act="new-activity">+ Activité</button>
    </section>`;
}

// ======================================================================
// Vue Ajouter (scan + recherche)
// ======================================================================
function renderAdd() {
  view.innerHTML = `
    <header class="top"><h1>Ajouter</h1></header>
    <div id="target" class="target"></div>
    <div class="viewfinder">
      <video id="video" playsinline muted hidden></video>
      <div class="idle" id="idle">Scanne un code-barres ou cherche un produit</div>
    </div>
    <div class="row">
      <button data-act="scan" id="scanBtn">Scanner</button>
      <button data-act="stop-scan" id="stopBtn" class="ghost" hidden>Arrêter</button>
    </div>
    <form class="row" id="searchForm">
      <input id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="Nom ou code-barres" aria-label="Rechercher un produit" value="${esc(ui.query)}">
      <button class="ghost">Chercher</button>
    </form>
    <p class="status" id="status" role="status"></p>
    <section id="results"></section>`;
  renderTarget();
  renderResults();
}

function mealOptions(selected) {
  const meals = sortMeals(store.getDay(ui.date).meals);
  return meals.map((m) =>
    `<option value="${m.id}"${m.id === selected ? " selected" : ""}>${esc(m.name)} · ${fmt(mealTotals(m).kcal)} kcal</option>`).join("") +
    `<option value=""${!meals.some((m) => m.id === selected) ? " selected" : ""}>Nouveau repas (${esc(suggestMealName(defaultTime()))})</option>`;
}

function renderTarget() {
  const el = $("#target");
  if (!el) return;
  if (!store.getDay(ui.date).meals.some((m) => m.id === ui.mealId)) ui.mealId = null;
  el.innerHTML = `<label for="mealSel">Ajouter à</label>
    <select id="mealSel">${mealOptions(ui.mealId)}</select>
    <span class="muted">${dayLabel(ui.date)}</span>`;
}

function productList(items) {
  return `<ul class="plist">${items.map((p) => `
    <li><button data-act="open-product" data-id="${esc(p.id)}">
      ${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : `<span class="ph" aria-hidden="true"></span>`}
      <span class="pinfo"><span class="pname">${esc(p.name)}</span>
        <small>${esc(p.brand)}${p.saved ? " · ★" : ""}${p.manual ? " · perso" : ""}</small></span>
      <span class="num pk">${fmt(p.per100.kcal)}<small>kcal/100 g</small></span>
    </button></li>`).join("")}</ul>`;
}

function renderResults() {
  const el = $("#results");
  if (!el) return;
  if (ui.results) {
    el.innerHTML = `<h2 class="label">Résultats · ${ui.results.length}</h2>${productList(ui.results)}`;
    return;
  }
  const all = Object.values(store.getState().products);
  const recent = all.filter((p) => p.lastUsed).sort((a, b) => b.lastUsed - a.lastUsed).slice(0, 8);
  const saved = all.filter((p) => p.saved).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  el.innerHTML =
    (recent.length ? `<h2 class="label">Récents</h2>${productList(recent)}` : "") +
    (saved.length ? `<h2 class="label">Enregistrés</h2>${productList(saved)}` : "") +
    (!recent.length && !saved.length ? `<p class="muted empty">Tes produits récents et enregistrés apparaîtront ici.</p>` : "");
}

function setStatus(msg, err = false) {
  const el = $("#status");
  if (!el) return msg && toast(msg);
  el.textContent = msg;
  el.classList.toggle("err", err);
}

async function doSearch(q) {
  q = q.trim();
  ui.query = q;
  if (!q) { ui.results = null; setStatus(""); return renderResults(); }
  if (/^\d{8,14}$/.test(q)) return lookupCode(q);
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

async function lookupCode(code) {
  setStatus(`Recherche de ${code}…`);
  const local = store.getState().products[code];
  try {
    const p = await off.getByCode(code);
    if (p) { cache.set(p.id, p); setStatus(""); return openProduct(p.id); }
    if (local) { setStatus(""); return openProduct(code); }
    setStatus(`Produit ${code} absent d'Open Food Facts. Tu peux le créer dans Produits.`, true);
  } catch (e) {
    if (local) { setStatus(""); return openProduct(code); } // hors ligne : version stockée
    setStatus("Erreur réseau : " + e.message, true);
  }
}

async function scan() {
  const video = $("#video");
  $("#idle").hidden = true;
  video.hidden = false;
  $("#scanBtn").hidden = true;
  $("#stopBtn").hidden = false;
  setStatus("Vise le code-barres…");
  try {
    await startScanner(video, (code) => {
      resetScanUI();
      navigator.vibrate?.(60);
      $("#q").value = code;
      ui.query = code;
      lookupCode(code);
    });
  } catch (e) {
    resetScanUI();
    setStatus(e.message, true);
  }
}

function stopScan() { stopScanner(); resetScanUI(); }

function resetScanUI() {
  const v = $("#video");
  if (!v) return;
  v.hidden = true;
  $("#idle").hidden = false;
  $("#scanBtn").hidden = false;
  $("#stopBtn").hidden = true;
}

// ======================================================================
// Fiche produit (feuille)
// ======================================================================
const storable = (p) => ({
  id: p.id, code: p.code ?? null, name: p.name, brand: p.brand ?? "", quantity: p.quantity ?? "",
  image: p.image ?? "", nutriscore: p.nutriscore ?? "", serving: p.serving ?? null,
  per100: { ...p.per100 }, ...(p.manual ? { manual: true } : {}),
});

function openProduct(id) {
  const p = findProduct(id);
  if (!p) return;
  const qty0 = p.serving || 100;
  const isSaved = () => !!store.getState().products[id]?.saved;
  const table = NUTRIENTS.map((n) =>
    `<tr${n.sub ? ' class="sub-row"' : ""}${n.key === "kcal" ? ' class="kcal"' : ""}><td>${n.label}</td><td class="num">${fmt(p.per100[n.key], n.dec)} ${n.unit}</td></tr>`).join("");

  openSheet(`
    <div class="phead">
      ${p.image ? `<img src="${esc(p.image)}" alt="">` : ""}
      <div><h2>${esc(p.name)}</h2>
        <p class="muted">${esc([p.brand, p.quantity].filter(Boolean).join(" · "))}</p>
        ${nutriChip(p.nutriscore)}</div>
    </div>
    <div class="qtyrow">
      <label>Quantité (g)<input name="qty" id="f-qty" inputmode="decimal" value="${qty0}" required></label>
      ${p.serving ? `<button type="button" class="ghost small" data-set-qty="${p.serving}">1 portion · ${fmt(p.serving)} g</button>` : ""}
      <button type="button" class="ghost small" data-set-qty="100">100 g</button>
    </div>
    <p class="preview num" id="preview"></p>
    <label>Repas · ${dayLabel(ui.date)}<select name="meal" id="f-meal">${mealOptions(ui.mealId)}</select></label>
    <div class="actions">
      <button value="save" class="ghost" id="saveBtn" formnovalidate>${isSaved() ? "★ Enregistré" : "☆ Enregistrer"}</button>
      <button value="add">Ajouter</button>
    </div>
    <table class="ntable"><caption>Pour 100 g</caption><tbody>${table}</tbody></table>
    ${p.code && !p.manual ? `<p class="muted small"><a href="https://world.openfoodfacts.org/product/${esc(p.code)}" target="_blank" rel="noopener">Voir sur Open Food Facts</a></p>` : ""}
  `, (action, fd) => {
    if (action === "save") {
      store.update((s) => {
        const cur = s.products[id];
        s.products[id] = { ...(cur ?? storable(p)), saved: !cur?.saved };
      });
      $("#saveBtn", sheet).textContent = isSaved() ? "★ Enregistré" : "☆ Enregistrer";
      return false;
    }
    const qty = num(fd.get("qty"));
    if (!qty || qty <= 0) return false;
    addEntry(p, qty, fd.get("meal"));
  });

  const preview = () => {
    const q = num($("#f-qty", sheet)?.value) ?? 0;
    const t = scale(p.per100, q);
    $("#preview", sheet).textContent =
      `${fmt(t.kcal)} kcal · ${fmt(t.prot, 1)} g prot. · ${fmt(t.carbs, 1)} g gluc. · ${fmt(t.fat, 1)} g lip.`;
  };
  sheet.onPreview = preview;
  preview();
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
    s.products[p.id] = { ...storable(p), saved: cur?.saved ?? false, lastUsed: Date.now() };
  });
  toast(`${p.name} ajouté à ${mealName}`);
}

// ======================================================================
// Repas, entrées, activités (feuilles)
// ======================================================================
function newMeal() {
  const time = defaultTime();
  let suggested = suggestMealName(time);
  openSheet(`
    <h2>Nouveau repas</h2>
    <label>Nom<input name="name" id="f-name" required maxlength="40" value="${esc(suggested)}"></label>
    <label>Heure<input name="time" id="f-time" type="time" required value="${time}"></label>
    <div class="actions">
      <button value="cancel" class="ghost" formnovalidate>Annuler</button>
      <button value="ok">Créer et ajouter des aliments</button>
    </div>`, (_, fd) => {
    const id = uid();
    store.update((s) => {
      store.ensureDay(s, ui.date).meals.push({ id, name: fd.get("name").trim(), time: fd.get("time"), entries: [] });
    });
    ui.mealId = id;
    ui.results = null;
    ui.query = "";
    go("add");
  });
  // Tant que le nom n'a pas été modifié, il suit l'heure choisie.
  $("#f-time", sheet).addEventListener("input", (e) => {
    const nameEl = $("#f-name", sheet);
    if (nameEl.value === suggested) nameEl.value = suggested = suggestMealName(e.target.value);
  });
}

function editMeal(mealId) {
  const meal = store.getDay(ui.date).meals.find((m) => m.id === mealId);
  if (!meal) return;
  let armed = false;
  openSheet(`
    <h2>Modifier le repas</h2>
    <label>Nom<input name="name" id="f-name" required maxlength="40" value="${esc(meal.name)}"></label>
    <label>Heure<input name="time" id="f-time" type="time" required value="${meal.time}"></label>
    <div class="actions">
      <button value="delete" class="ghost danger" id="delBtn" formnovalidate>Supprimer</button>
      <button value="ok">Enregistrer</button>
    </div>`, (action, fd) => {
    if (action === "delete") {
      if (!armed) {
        armed = true;
        $("#delBtn", sheet).textContent = meal.entries.length ? `Supprimer avec ${meal.entries.length} aliment(s) ?` : "Confirmer";
        return false;
      }
      store.update((s) => {
        const d = store.ensureDay(s, ui.date);
        d.meals = d.meals.filter((m) => m.id !== mealId);
        store.pruneDay(s, ui.date);
      });
      return;
    }
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
  openSheet(`
    <h2>${esc(e.name)}</h2>
    <p class="muted">${esc(e.brand)}${e.brand ? " · " : ""}${fmt(e.per100.kcal)} kcal/100 g</p>
    <label>Quantité (g)<input name="qty" id="f-qty" inputmode="decimal" required value="${e.qty}"></label>
    <p class="preview num" id="preview"></p>
    <label>Repas<select name="meal" id="f-meal">${sortMeals(store.getDay(ui.date).meals).map((m) =>
      `<option value="${m.id}"${m.id === mealId ? " selected" : ""}>${esc(m.name)}</option>`).join("")}</select></label>
    <div class="actions">
      <button value="delete" class="ghost danger" formnovalidate>Retirer</button>
      <button value="ok">Enregistrer</button>
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
    const t = scale(e.per100, num($("#f-qty", sheet).value) ?? 0);
    $("#preview", sheet).textContent = `${fmt(t.kcal)} kcal · ${fmt(t.prot, 1)} g prot. · ${fmt(t.carbs, 1)} g gluc. · ${fmt(t.fat, 1)} g lip.`;
  };
  sheet.onPreview();
}

function editActivity(id) {
  const a = id ? store.getDay(ui.date).activities.find((x) => x.id === id) : null;
  openSheet(`
    <h2>${a ? "Modifier l'activité" : "Nouvelle activité"}</h2>
    <label>Nom<input name="name" id="f-aname" required maxlength="40" placeholder="Course, vélo, muscu…" value="${esc(a?.name ?? "")}"></label>
    <div class="grid2">
      <label>Durée (min)<input name="minutes" id="f-min" inputmode="numeric" required value="${a?.minutes ?? ""}"></label>
      <label>Calories brûlées<input name="kcal" id="f-akcal" inputmode="numeric" required value="${a?.kcal ?? ""}"></label>
    </div>
    <div class="actions">
      ${a ? `<button value="delete" class="ghost danger" formnovalidate>Supprimer</button>` : `<button value="cancel" class="ghost" formnovalidate>Annuler</button>`}
      <button value="ok">Enregistrer</button>
    </div>`, (action, fd) => {
    store.update((s) => {
      const d = store.ensureDay(s, ui.date);
      if (action === "delete") {
        d.activities = d.activities.filter((x) => x.id !== id);
        return store.pruneDay(s, ui.date);
      }
      const data = { name: fd.get("name").trim(), minutes: num(fd.get("minutes")) ?? 0, kcal: num(fd.get("kcal")) ?? 0 };
      if (a) Object.assign(d.activities.find((x) => x.id === id), data);
      else d.activities.push({ id: uid(), ...data });
    });
  });
}

// ======================================================================
// Vue Produits
// ======================================================================
function renderProducts() {
  view.innerHTML = `
    <header class="top"><h1>Produits</h1><button class="small" data-act="new-product">+ Créer</button></header>
    <input type="search" id="pfilter" placeholder="Filtrer mes produits" aria-label="Filtrer mes produits" value="${esc(ui.pfilter)}">
    <div id="plists"></div>`;
  renderPLists();
}

function renderPLists() {
  const el = $("#plists");
  if (!el) return;
  const f = ui.pfilter.trim().toLowerCase();
  const all = Object.values(store.getState().products)
    .filter((p) => !f || `${p.name} ${p.brand}`.toLowerCase().includes(f));
  const saved = all.filter((p) => p.saved).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const other = all.filter((p) => !p.saved).sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0));
  el.innerHTML =
    (saved.length ? `<h2 class="label">Enregistrés · ${saved.length}</h2>${productList(saved)}` : "") +
    (other.length ? `<h2 class="label">Déjà utilisés</h2>${productList(other)}` : "") +
    (!all.length ? `<p class="muted empty">${f ? "Aucun produit ne correspond." : "Aucun produit pour l'instant. Scanne un produit, ou crée le tien (plat maison, produit sans code-barres)."}</p>` : "");
}

function newProduct() {
  const fields = [["kcal", "Calories (kcal)"], ["prot", "Protéines (g)"], ["carbs", "Glucides (g)"], ["fat", "Lipides (g)"], ["fiber", "Fibres (g)"]];
  openSheet(`
    <h2>Créer un produit</h2>
    <label>Nom<input name="name" id="f-pname" required maxlength="60" placeholder="Lasagnes maison"></label>
    <label>Marque ou note (facultatif)<input name="brand" id="f-pbrand" maxlength="40"></label>
    <p class="label">Valeurs pour 100 g</p>
    <div class="grid2">${fields.map(([k, l]) =>
      `<label>${l}<input name="${k}" id="f-p${k}" inputmode="decimal"${k === "kcal" ? " required" : ""}></label>`).join("")}
      <label>Portion (g, facultatif)<input name="serving" id="f-pserving" inputmode="decimal"></label>
    </div>
    <div class="actions">
      <button value="cancel" class="ghost" formnovalidate>Annuler</button>
      <button value="ok">Créer</button>
    </div>`, (_, fd) => {
    const id = "m-" + uid();
    const per100 = Object.fromEntries(NUTRIENTS.map((n) => [n.key, num(fd.get(n.key))]));
    store.update((s) => {
      s.products[id] = { ...storable({ id, name: fd.get("name").trim(), brand: fd.get("brand").trim(),
        serving: num(fd.get("serving")), per100, manual: true }), saved: true };
    });
    toast("Produit créé");
  });
}

// ======================================================================
// Vue Réglages
// ======================================================================
function renderSettings() {
  const s = store.getState();
  const g = s.goals;
  const goalFields = [["kcal", "Calories", "kcal"], ["prot", "Protéines", "g"], ["carbs", "Glucides", "g"], ["fat", "Lipides", "g"], ["fiber", "Fibres", "g"]];
  view.innerHTML = `
    <header class="top"><h1>Réglages</h1></header>
    <form class="card" id="goalsForm">
      <h2>Objectifs par jour</h2>
      <div class="grid2">${goalFields.map(([k, l, u]) =>
        `<label>${l} (${u})<input id="g-${k}" name="${k}" inputmode="decimal" value="${g[k] ?? ""}"></label>`).join("")}</div>
      <p class="muted small">Laisse vide pour ne pas suivre un nutriment. Les calories des activités s'ajoutent à l'objectif du jour.</p>
      <button>Enregistrer les objectifs</button>
    </form>
    <section class="card">
      <h2>Données</h2>
      <p class="muted small">Tout est stocké dans ce navigateur, sur cet appareil. Exporte une sauvegarde de temps en temps.</p>
      <p class="small num">${Object.keys(s.products).length} produits · ${Object.keys(s.days).length} jours · ${store.sizeKb()} Ko · <span id="persist">…</span></p>
      <div class="row">
        <button class="ghost" data-act="export">Exporter la sauvegarde</button>
        <label class="button ghost" for="importFile">Importer</label>
        <input type="file" id="importFile" accept="application/json,.json" hidden>
      </div>
      <button class="ghost danger small" data-act="wipe">Tout effacer</button>
    </section>
    <p class="muted small credit">Données produits : <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a>, licence ODbL.</p>`;
  store.requestPersist().then((ok) => {
    const el = $("#persist");
    if (el) el.textContent = ok ? "stockage persistant" : "stockage non garanti (ajoute l'appli à l'écran d'accueil)";
  });
}

function exportBackup() {
  const blob = new Blob([store.exportData()], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `carnet-${todayKey()}.json`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importBackup(file) {
  file.text().then((text) => {
    openSheet(`
      <h2>Importer la sauvegarde ?</h2>
      <p>Les données actuelles de cet appareil seront remplacées par celles de <strong>${esc(file.name)}</strong>.</p>
      <div class="actions"><button value="cancel" class="ghost" formnovalidate>Annuler</button><button value="ok">Remplacer</button></div>`,
    () => {
      try { store.importData(text); toast("Sauvegarde importée"); }
      catch (e) { toast(e.message.startsWith("Ce fichier") ? e.message : "Fichier illisible."); }
    });
  });
}

function confirmWipe() {
  openSheet(`
    <h2>Tout effacer ?</h2>
    <p>Repas, activités, produits et objectifs seront supprimés de cet appareil. Pense à exporter une sauvegarde avant.</p>
    <div class="actions"><button value="cancel" class="ghost" formnovalidate>Annuler</button><button value="ok" class="danger-fill">Tout effacer</button></div>`,
  () => { store.wipe(); toast("Données effacées"); });
}

// ======================================================================
// Feuille modale et toast
// ======================================================================
function openSheet(html, onSubmit) {
  sheet.onPreview = null;
  sheet.innerHTML = `<form method="dialog" class="sheet-body">${html}</form>`;
  const form = $("form", sheet);
  form.addEventListener("submit", (e) => {
    const action = e.submitter?.value ?? "ok";
    if (action === "cancel") return; // fermeture native
    e.preventDefault();
    if (action !== "delete" && action !== "save" && !form.reportValidity()) return;
    if (onSubmit(action, new FormData(form), form) !== false) sheet.close();
  });
  sheet.showModal();
}

sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });
sheet.addEventListener("input", (e) => { if (e.target.id === "f-qty") sheet.onPreview?.(); });

let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2500);
}

// ======================================================================
// Événements
// ======================================================================
const actions = {
  "prev-day": () => { ui.date = addDays(ui.date, -1); render(); },
  "next-day": () => { ui.date = addDays(ui.date, 1); render(); },
  today: () => { ui.date = todayKey(); render(); },
  "new-meal": newMeal,
  "edit-meal": (d) => editMeal(d.meal),
  "add-to-meal": (d) => { ui.mealId = d.meal; ui.results = null; ui.query = ""; go("add"); },
  "edit-entry": (d) => editEntry(d.meal, d.entry),
  "new-activity": () => editActivity(null),
  "edit-activity": (d) => editActivity(d.id),
  scan,
  "stop-scan": () => { stopScan(); setStatus(""); },
  "open-product": (d) => openProduct(d.id),
  "new-product": newProduct,
  export: exportBackup,
  wipe: confirmWipe,
};

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-nav],[data-act],[data-set-qty]");
  if (!b) return;
  if (b.dataset.nav) {
    if (sheet.open) sheet.close();
    if (b.dataset.nav === "add" && ui.view !== "add") { ui.results = null; ui.query = ""; }
    return go(b.dataset.nav);
  }
  if (b.dataset.setQty) {
    $("#f-qty", sheet).value = b.dataset.setQty;
    return sheet.onPreview?.();
  }
  actions[b.dataset.act]?.(b.dataset, b);
});

document.addEventListener("submit", (e) => {
  if (e.target.id === "searchForm") {
    e.preventDefault();
    stopScan();
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
  if (e.target.id === "importFile" && e.target.files[0]) { importBackup(e.target.files[0]); e.target.value = ""; }
});

// Revenir sur l'appli le lendemain : la vue « aujourd'hui » suit la date.
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

store.requestPersist();
render();
