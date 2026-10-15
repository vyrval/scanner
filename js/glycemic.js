// Index glycémique (IG) et charge glycémique (CG).
//
// Ni Open Food Facts ni Ciqual ne donnent l'IG : on le déduit d'une table de
// familles d'aliments, rapprochée du nom du produit et de ses catégories OFF.
// Valeurs moyennes publiées, surtout Atkinson, Foster-Powell et Brand-Miller,
// « International Tables of Glycemic Index and Glycemic Load Values: 2008 »,
// Diabetes Care 31(12) (référence glucose = 100). Les familles marquées « ≈ »
// sont des rapprochements avec l'aliment mesuré le plus proche.
// Un IG varie de ±10 à ±20 selon la variété, la cuisson, l'étude : c'est un
// ordre de grandeur, pas une mesure.
//
// CG d'une portion = IG × glucides de la portion (g) / 100. Les glucides des
// étiquettes UE et de Ciqual excluent déjà les fibres : c'est le bon chiffre.

// En dessous (g de glucides pour 100 g), l'IG n'a pas de sens (viande,
// fromage, huile, légumes très pauvres en glucides) : charge comptée nulle.
export const LOW_CARBS = 4;

// [libellé, IG, motif sur le texte replié (minuscules, sans accents)]
// Le motif qui commence le plus tôt dans le nom gagne, puis le plus long :
// « Yaourt à la banane » -> yaourt, « Pomme de terre » plutôt que « Pomme ».
const FAMILIES = [
  // Pains et viennoiseries
  ["Pain blanc", 75, /\bpains?\b(?! d'epices)|\bpain de campagne/],
  ["Baguette", 95, /\bbaguettes?\b|\bpains?, baguette\b/],
  ["Pain de mie", 75, /\bpains? de mie\b/],
  ["Pain complet", 74, /\bpains?\b[^(]*\b(complets?|integral|au son)\b/],
  ["Pain aux céréales", 53, /\bpains?\b[^(]*\b(aux cereales|multi ?cereales?|aux graines)\b/],
  ["Pain de seigle", 58, /\bpains? (de seigle|noir)\b|pumpernickel/],
  ["Pain au levain ≈", 54, /\bpains?\b[^(]*\bau levain\b/],
  ["Pain pita ≈", 57, /\bpains? pitas?\b|\bpitas?\b/],
  ["Pain pour burger ≈", 61, /\bpains? (a |pour )?(hamburger|burger)s?\b|\bburger buns?\b/],
  ["Biscotte, pain grillé ≈", 70, /\bbiscottes?\b|\bpains? grilles?\b|\bpain suedois\b|\bcracottes?\b|\bkrisprolls?\b|\bcroutons?\b/],
  ["Viennoiserie (croissant)", 67, /\bcroissants?\b|\bpains? au chocolat\b|\bchocolatines?\b|\bviennoiseries?\b|\bpains? aux raisins\b|\bpains? au lait\b|\bbrioches?\b|\bpains? brioches?\b/],
  ["Tortilla, wrap", 30, /\btortillas?\b|\bwraps?\b|\bfajitas?\b/],
  ["Tortilla de maïs", 46, /\btortillas? de mais\b|\btacos?\b|\bnachos?\b/],
  ["Crêpe, pancake ≈", 66, /\bcrepes?\b|\bpancakes?\b|\bblinis?\b/],
  ["Gaufre", 76, /\bgaufres?\b|\bwaffles?\b/],
  ["Beignet, donut", 76, /\bdonuts?\b|\bdoughnuts?\b|\bbeignets?\b/],
  ["Pizza", 60, /\bpizzas?\b|\bpate a pizza\b/],
  ["Hamburger", 66, /\bhamburgers?\b|\bcheeseburgers?\b/],
  ["Sushi", 48, /\bsushis?\b|\bmakis?\b/],

  // Céréales du petit-déjeuner, biscuits, gâteaux
  ["Corn flakes", 81, /\bcorn ?flakes\b|\bpetales de mais\b/],
  ["Céréales du petit-déjeuner", 69, /^cereales\b|\bcereales (pour |du )?petit[ -]dejeuners?\b|\bspecial k\b|\bweetabix\b|\bflocons de (ble|riz)\b|\bpetales de ble\b/],
  ["Céréales chocolatées", 77, /\bcereales (pour petit[ -]dejeuner )?(chocolatees|fourrees)\b|\bcereales (pour petit[ -]dejeuner )?au chocolat\b|\bpetales de ble chocolates?\b|\bchocapic\b|\bcoco pops\b/],
  ["Céréales soufflées", 80, /\bgrains de ble souffles?\b|\bble[^(]* souffle|\bboules de mais souffle|\bcereales completes soufflees\b/],
  ["Muesli", 57, /\bmueslis?\b|\bgranola\b|\bcereales croustillantes\b/],
  ["Flocons d'avoine, porridge", 55, /\bavoine\b|\bporridge\b|\bgruau\b/],
  ["Son de blé (All-Bran)", 44, /\ball[ -]?bran\b|\bson de ble\b/],
  ["Riz soufflé, galette de riz", 87, /\briz souffle\b|\brice krispies\b|\bgalettes? (de |au )?(riz|mais|cereales)\b|\bcrackers? de riz\b|\bgalettes? multicereales\b|\btartines? craquantes?\b/],
  ["Barre de céréales ≈", 61, /\bbarres? (de |aux )?cereales\b|\bbarres? cerealieres?\b/],
  ["Biscuit sec ≈", 55, /\bbiscuits?\b|\bbarres? biscuitees?\b|\bpetits?[ -]beurres?\b|\bsables?\b|\bgalettes? bretonnes?\b|\bboudoirs?\b|\bspeculoos\b|\bcookies?\b|\bpalets?\b|\bgaufrettes?\b/],
  ["Biscuit apéritif, crackers ≈", 70, /\bbiscuits? aperitifs?\b|\bcrackers?\b|\btucs?\b/],
  ["Bretzel", 83, /\bbretzels?\b|\bpretzels?\b/],
  ["Chips", 56, /\bchips\b|\btuiles? salees?\b/],
  ["Pop-corn", 65, /\bpop[ -]?corn\b/],
  ["Gâteau ≈", 50, /\bgateaux?\b|\bcakes?\b|\bgenoises?\b|\bmadeleines?\b|\bfinanciers?\b|\bbrownies?\b|\bquatre[ -]quarts\b|\bsavarins?\b|\bclafoutis\b|\bcheesecakes?\b|\btartes?\b|\btartelettes?\b|\beclairs?\b|\bchoux\b|\bchoux? a la creme\b|\bmoelleux\b|\bbuches?\b|\bmillefeuilles?\b|\bmille[ -]feuilles?\b/],
  ["Muffin", 60, /\bmuffins?\b/],
  ["Pâte à tarte, feuilleté ≈", 59, /\bpates? (brisees?|feuilletees?|sablees?|phyllo|filo|a tarte)\b|\bfeuilletes?\b|\bfriands?\b|\bgalettes? des rois\b/],

  // Riz, pâtes, céréales
  ["Riz blanc", 73, /\briz\b/],
  ["Riz basmati ≈", 58, /\briz basmati\b|\bbasmati\b/],
  ["Riz thaï ≈", 80, /\briz thai\b|\briz jasmin\b|\briz gluant\b/],
  ["Riz thaï ou basmati ≈", 69, /\briz thai ou basmati\b/],
  ["Riz complet", 68, /\briz (complet|brun|semi[ -]complet|rouge|noir)\b/],
  ["Riz étuvé ≈", 60, /\briz (blanc )?etuve\b/],
  ["Riz sauvage ≈", 57, /\briz sauvage\b/],
  ["Risotto ≈", 69, /\brisottos?\b|\briz arborio\b/],
  ["Pâtes", 49, /\bpates\b(?! (feuilletees|brisees|sablees|a tarte|a crepes|a tartiner|de fruits|d'amandes?))|\bspaghettis?\b|\btagliatelles?\b|\bcoquillettes\b|\bpennes?\b|\bfusillis?\b|\bmacaronis?\b|\bfarfalles?\b|\blinguines?\b|\blasagnes?\b|\braviolis?\b|\btortellinis?\b|\bravioles\b|\bcannellonis?\b|\btorsades\b|\bvermicelles?\b|\bnouilles\b/],
  ["Pâtes complètes", 48, /\bpates[^,]*\bcomplet(es)?\b|\bspaghettis? complets?\b/],
  ["Nouilles de riz", 53, /\b(nouilles|vermicelles?) de riz\b/],
  ["Gnocchi ≈", 68, /\bgnocchis?\b/],
  ["Semoule, couscous", 65, /\bsemoules?\b|\bcouscous\b|\btaboules?\b/],
  ["Polenta ≈", 68, /\bpolenta\b|\bsemoule de mais\b/],
  ["Boulgour ≈", 48, /\bboulgour\b|\bbulgur\b|\bble (dur )?(precuit|concasse)\b|\bebly\b/],
  ["Quinoa ≈", 53, /\bquinoa\b/],
  ["Sarrasin ≈", 54, /\bsarrasin\b|\bkasha\b/],
  ["Millet", 67, /\bmillet\b|\bmil\b/],
  ["Blé (grains) ≈", 45, /\bble\b|\bepeautre\b|\bkhorasan\b|\bkamut\b/],
  ["Orge", 28, /\borge\b/],
  ["Maïs doux", 52, /\bmais\b/],
  ["Farine ≈", 70, /\bfarines?\b/],

  // Pommes de terre et tubercules
  ["Pomme de terre cuite à l'eau", 78, /\bpommes? de terre\b|\bpatates?\b|\bgratin dauphinois\b/],
  ["Purée de pommes de terre", 87, /\bpurees?[^,]*pommes? de terre\b|\bpommes? de terre[^(]*\b(puree|flocons)\b|\bpuree (mousseline|en flocons)\b|\bhachis parmentier\b|\bparmentier\b/],
  ["Pomme de terre au four ≈", 85, /\bpommes? de terre[^(]*\b(au four|rotie)/],
  ["Frites", 63, /\bfrites\b|^frites?\b|\bpommes? de terre[^(]*\b(frite|saute|rissole|poele|noisette|dauphine|duchesse)|\bpotatoes\b|\bpommes? (noisettes?|dauphines?|duchesses?|frites|sautees|rissolees|paille|allumettes)\b/],
  ["Patate douce", 63, /\bpatates? douces?\b/],
  ["Manioc ≈", 46, /\bmanioc\b/],
  ["Igname ≈", 54, /\bignames?\b/],
  ["Taro", 53, /\btaros?\b/],
  ["Châtaigne ≈", 54, /\bchataignes?\b|\bmarrons?\b/],
  ["Banane plantain", 55, /\bbananes? plantains?\b|\bplantains?\b/],

  // Légumineuses
  ["Lentilles", 32, /\blentilles?\b/],
  ["Pois chiches", 28, /\bpois[ -]chiches?\b|\bhoumm?ous\b|\bhummus\b|\bfalafels?\b/],
  ["Haricots rouges", 24, /\bharicots? (rouges?|noirs?)\b/],
  ["Haricots blancs ≈", 31, /\bharicots? (blancs?|secs?|lingots?|coco|tarbais|mungo|de lima)\b|\bmogettes?\b|\bflageolets?\b|\bcassoulet\b/],
  ["Pois cassés ≈", 25, /\bpois casses?\b/],
  ["Petits pois ≈", 51, /\bpetits? pois\b/],
  ["Légumes secs ≈", 30, /\blegumes? secs\b|\blegumineuses?\b/],
  ["Soja", 16, /\bsoja\b|\bedamames?\b/],

  // Légumes
  ["Carotte cuite", 39, /\bcarottes?\b/],
  ["Carotte crue ≈", 16, /\bcarottes?[^(]*\b(crues?|rapees?)\b/],
  ["Betterave ≈", 64, /\bbetteraves?\b/],
  ["Potiron, courge", 64, /\bpotirons?\b|\bcitrouilles?\b|\bcourges?\b|\bbutternut\b|\bpotimarrons?\b/],
  ["Panais ≈", 52, /\bpanais\b/],
  ["Soupe de légumes", 48, /\bsoupes?\b|\bpotages?\b|\bveloutes?\b|\bminestrone\b/],
  ["Légume non féculent ≈", 15, /\boignons?\b|\bechalotes?\b|\bpoireaux?\b|\bpoivrons?\b|\btomates?\b|\bharicots? verts?\b|\bcourgettes?\b|\baubergines?\b|\bchoux?\b|\bchou-fleur\b|\bbrocolis?\b|\bepinards?\b|\bconcombres?\b|\bceleris?\b|\bnavets?\b|\bradis\b|\basperges?\b|\bartichauts?\b|\bchampignons?\b|\bfenouils?\b|\bendives?\b|\bratatouille\b|\blegumes?\b|\blaitues?\b|\bmache\b|\broquette\b|\bsalades? vertes?\b|\bgaspacho\b/],

  // Fruits
  ["Fruits ≈", 40, /\bfruits?\b(?! de mer| a coque)|\bcompotes?\b/],
  ["Pomme", 36, /\bpommes?\b/],
  ["Poire ≈", 38, /\bpoires?\b/],
  ["Orange", 43, /\boranges?\b|\bclementines?\b|\bmandarines?\b/],
  ["Pamplemousse ≈", 25, /\bpamplemousses?\b|\bpomelos?\b/],
  ["Banane", 51, /\bbananes?\b/],
  ["Raisin ≈", 59, /\braisins?\b/],
  ["Raisins secs ≈", 64, /\braisins?[^(]*\bsecs?\b/],
  ["Ananas", 59, /\bananas\b/],
  ["Mangue", 51, /\bmangues?\b/],
  ["Kiwi ≈", 52, /\bkiwis?\b/],
  ["Pêche", 43, /\bpeches?\b|\bnectarines?\b|\bbrugnons?\b/],
  ["Abricot ≈", 34, /\babricots?\b/],
  ["Abricot sec ≈", 31, /\babricots?[^(]*\bsecs?\b/],
  ["Prune ≈", 40, /\bprunes?\b|\bmirabelles?\b|\bquetsches?\b/],
  ["Pruneau ≈", 29, /\bpruneaux?\b/],
  ["Cerise ≈", 22, /\bcerises?\b/],
  ["Fraise ≈", 40, /\bfraises?\b/],
  ["Fruits rouges ≈", 53, /\bmyrtilles?\b|\bframboises?\b|\bmures?\b|\bcassis\b|\bgroseilles?\b|\bfruits rouges\b/],
  ["Pastèque", 76, /\bpasteques?\b/],
  ["Melon ≈", 65, /\bmelons?\b/],
  ["Papaye ≈", 56, /\bpapayes?\b/],
  ["Datte", 42, /\bdattes?\b/],
  ["Figue sèche ≈", 61, /\bfigues?[^(]*\bseche(e)?s?\b/],
  ["Fruits à coque ≈", 20, /\bnoix\b|\bamandes?\b|\bnoisettes?\b|\bpistaches?\b|\bcacahuetes?\b|\barachides?\b|\bfruits a coque\b/],

  // Produits laitiers et boissons végétales
  ["Lait", 39, /\blaits?\b/],
  ["Lait concentré sucré ≈", 61, /\blaits? concentres? sucres?\b/],
  ["Boisson au soja", 34, /\b(laits?|boissons?|boissons? vegetales?) (de |au |a base de )?soja\b/],
  ["Boisson au riz", 86, /\b(laits?|boissons?|boissons? vegetales?) (de |au |a base de )?riz\b/],
  ["Boisson à l'avoine ≈", 69, /\b(laits?|boissons?|boissons? vegetales?) (d'|a l'|a base d')avoine\b/],
  ["Boisson chocolatée ≈", 40, /\blaits? chocolates?\b|\bchocolat chaud\b|\bpoudres? (chocolatees?|cacaotees?)\b|\bcacao en poudre\b|\bboissons? (cacaotees?|au chocolat|chocolatees?)\b|\bnesquik\b|\bbanania\b|\bovomaltine\b/],
  ["Yaourt", 41, /\byaourts?\b|\byogh?ourts?\b|\bfromages? blancs?\b|\bfaisselles?\b|\bpetits?[ -]suisses?\b|\bskyr\b|\blaits? fermentes?\b|\bkefir\b/],
  ["Crème dessert ≈", 40, /\bcremes? dessert\b|\bcremes? (au |a la )(chocolat|vanille|caramel|cafe|pistache)\b|\bcremes? brulees?\b|\bcremes? caramel\b|\bcremes? (anglaise|patissiere)\b|\bmousses? au chocolat\b|\bliegeois\b|\bflans?\b|\bdanettes?\b|\bentremets?\b/],
  ["Glace", 51, /\bglaces?\b|\bcremes? glacees?\b|\bsorbets?\b|\besquimaux?\b|\bbarres? glacees?\b|\bcornets?\b/],

  // Sucres, confiseries, chocolat
  ["Sucre", 65, /^sucres?\b|\bsucres? (blanc|roux|en poudre|semoule|de canne|glace|en morceaux)\b|\bcassonade\b|\bvergeoise\b/],
  ["Fructose", 15, /^fructose\b/],
  ["Sirop d'agave ≈", 15, /\bagave\b/],
  ["Miel", 61, /\bmiel\b/],
  ["Sirop d'érable ≈", 54, /\bsirops? d'erable\b/],
  ["Sirop ≈", 65, /\bsirops?\b/],
  ["Confiture", 49, /\bconfitures?\b|\bmarmelades?\b|\bgelees? de\b/],
  ["Pâte à tartiner ≈", 33, /\bpates? a tartiner\b|\bnutella\b/],
  ["Chocolat", 40, /\bchocolats?\b/],
  ["Chocolat noir ≈", 25, /\bchocolats? noirs?\b|\bchocolats?[^(]*\b[5-9]\d ?%/],
  ["Barre chocolatée ≈", 55, /\bbarres? chocolatees?\b|\bsnickers\b|\btwix\b|\bbounty\b|\bkinder bueno\b/],
  ["Bonbons ≈", 78, /\bbonbons?\b|\bconfiseries?\b|\bguimauves?\b|\bmarshmallows?\b|\bpates? de fruits?\b|\bdragees?\b|\breglisses?\b|\bcaramels?\b|\bsucettes?\b|\bgommes?\b|\bharibo\b|\bfraises tagada\b/],

  // Boissons
  ["Soda", 59, /\bsodas?\b|\bcolas?\b|\bcoca\b|\blimonades?\b|\bboissons? gazeuses?\b|\bboissons? rafraichissantes?\b|\btonic\b|\bice tea\b|\bthes? glaces?\b|\bboissons? aux fruits\b|\borangina\b|\bfanta\b|\bsprite\b|\bschweppes\b|\bboissons? energisantes?\b|\bboissons? au the\b|\bboissons? plates?\b/],
  ["Jus de fruits", 50, /\bjus\b|\bnectars?\b|\bsmoothies?\b/],
  ["Jus d'orange", 50, /\bjus d'(oranges?|agrumes)\b/],
  ["Jus de pomme", 41, /\bjus de pommes?\b/],
  ["Jus de carotte ≈", 43, /\bjus de carottes?\b/],
].map(([label, gi, re]) => ({ label: label.replace(/ ≈$/, ""), approx: label.endsWith("≈"), gi, re }));

export const fold = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/œ/g, "oe").replace(/æ/g, "ae").replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();

// Meilleure famille pour un texte : celle qui commence le plus tôt, puis la plus longue.
function bestFamily(text) {
  const t = fold(text);
  let best = null;
  for (const f of FAMILIES) {
    const m = f.re.exec(t);
    if (!m) continue;
    if (!best || m.index < best.at || (m.index === best.at && m[0].length > best.len)) {
      best = { f, at: m.index, len: m[0].length };
    }
  }
  return best?.f ?? null;
}

// IG estimé d'un produit : d'abord ses catégories OFF, de la plus précise
// (la dernière) à la plus générale, puis son nom.
// -> { v, ref } (ref : famille retenue) ou null si rien ne correspond.
export function estimate(name, categories = []) {
  for (const c of [...categories].reverse()) {
    // « Céréales et pommes de terre », « Légumes et dérivés » : trop large.
    if (/ et /.test(fold(c))) continue;
    const f = bestFamily(String(c).replace(/^[a-z]{2}:/, ""));
    if (f) return { v: f.gi, ref: f.label };
  }
  const f = bestFamily(name);
  return f ? { v: f.gi, ref: f.label } : null;
}

// IG stocké sur un produit ou une entrée de repas :
//   { v, ref }          estimé d'après la table
//   { v, manual: true } saisi à la main (produit perso)
//   { v, mix: true }    calculé d'après les ingrédients (recette)
//   null                cherché, inconnu
// Absent (produit ou repas enregistré avant l'IG) : estimé d'après le nom.
export const giOf = (x) => (x?.gi !== undefined ? x.gi : estimate(x?.name));

export const lowCarb = (per100) => per100?.carbs != null && per100.carbs < LOW_CARBS;

// Seuils usuels : IG bas ≤ 55, élevé ≥ 70 ; CG d'une portion basse ≤ 10, élevée ≥ 20 ;
// CG d'une journée basse < 80, élevée > 120.
const LEVELS = { low: "bas", mid: "moyen", high: "élevé" };
export const giLevel = (v) => (v <= 55 ? "low" : v < 70 ? "mid" : "high");
export const glLevel = (v) => (v <= 10 ? "low" : v < 20 ? "mid" : "high");
export const dayGlLevel = (v) => (v < 80 ? "low" : v <= 120 ? "mid" : "high");
export const levelLabel = (lvl, fem = false) => (fem ? { low: "basse", mid: "moyenne", high: "élevée" }[lvl] : LEVELS[lvl]);

// Bilan d'une liste d'aliments { qty, per100, gi?, name } (repas, journée, recette).
//   gl      : charge glycémique (aliments à IG connu, les pauvres en glucides comptent 0)
//   gi      : IG moyen pondéré par les glucides (null si aucun connu)
//   carbs   : glucides des aliments à IG connu
//   unknown : glucides des aliments dont l'IG est inconnu (non comptés dans gl)
export function glycemic(items) {
  let gl = 0, carbs = 0, unknown = 0;
  for (const x of items) {
    const c100 = x.per100?.carbs;
    if (c100 == null || lowCarb(x.per100)) continue;
    const c = (c100 * (x.qty ?? 0)) / 100;
    const g = giOf(x)?.v;
    if (g == null) { unknown += c; continue; }
    gl += (g * c) / 100;
    carbs += c;
  }
  return { gl, gi: carbs > 0 ? gl * 100 / carbs : null, carbs, unknown };
}

// IG d'une recette : moyenne des ingrédients pondérée par leurs glucides.
// Inconnu si plus d'un quart des glucides vient d'ingrédients sans IG.
export function recipeGI(items) {
  const r = glycemic(items);
  if (r.gi == null || r.unknown > (r.carbs + r.unknown) / 4) return null;
  return { v: Math.round(r.gi), mix: true };
}
