// Lecture de code-barres par la caméra.
// BarcodeDetector natif (Chrome Android) sinon ZXing chargé à la demande (iOS, Firefox).

const ZXING_URL = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js";
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];
let current = null;

function loadZXing() {
  if (window.ZXing) return Promise.resolve();
  return new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = ZXING_URL;
    s.onload = ok;
    s.onerror = () => ko(new Error("Impossible de charger le lecteur de code-barres."));
    document.head.appendChild(s);
  });
}

function cameraError(e) {
  if (e?.name === "NotAllowedError") return new Error("Accès à la caméra refusé. Autorise-le dans les réglages du navigateur.");
  if (e?.name === "NotFoundError") return new Error("Aucune caméra trouvée.");
  return e instanceof Error ? e : new Error(String(e));
}

// Clé de contrôle GTIN (EAN-8, UPC-A, EAN-13, GTIN-14).
export function isValidCode(code) {
  if (/^[01]\d{7}$/.test(code) && isValidCode(upcEtoA(code))) return true;
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false;
  const d = code.split("").map(Number);
  const check = d.pop();
  const sum = d.reverse().reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

// UPC-E (8 chiffres) -> UPC-A (12 chiffres), pour vérifier la clé.
function upcEtoA(e) {
  const [ns, a, b, c, d, f, x, chk] = e.split("");
  const body = x <= "2" ? `${a}${b}${x}0000${c}${d}${f}`
    : x === "3" ? `${a}${b}${c}00000${d}${f}`
    : x === "4" ? `${a}${b}${c}${d}00000${f}`
    : `${a}${b}${c}${d}${f}0000${x}`;
  return `${ns}${body}${chk}`;
}

// Caméra arrière en bonne définition : plus de détails = lecture possible
// d'un peu plus loin, là où l'autofocus fonctionne mieux.
function constraints(width, height) {
  return {
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: width }, height: { ideal: height },
      advanced: [{ focusMode: "continuous" }],
    },
  };
}

// Réglages caméra disponibles selon le téléphone (surtout Chrome Android ;
// Safari n'en expose presque aucun).
function makeControls(track) {
  const caps = track?.getCapabilities?.() ?? {};
  const settings = () => track?.getSettings?.() ?? {};
  const apply = (c) => track.applyConstraints({ advanced: [c] }).catch(() => {});
  const focusModes = caps.focusMode ?? [];
  if (focusModes.includes("continuous")) apply({ focusMode: "continuous" });

  return {
    torch: !!caps.torch,
    zoom: caps.zoom && caps.zoom.max > caps.zoom.min ? { min: caps.zoom.min, max: caps.zoom.max } : null,
    canFocus: focusModes.includes("single-shot") || focusModes.includes("continuous") || !!caps.pointsOfInterest,
    async setTorch(on) { await apply({ torch: !!on }); },
    async setZoom(z) {
      if (!this.zoom) return;
      await apply({ zoom: Math.min(this.zoom.max, Math.max(this.zoom.min, z)) });
    },
    getZoom() { return settings().zoom ?? 1; },
    // Toucher pour faire la mise au point (x, y entre 0 et 1), puis retour en continu.
    async focusAt(x, y) {
      const c = {};
      if (caps.pointsOfInterest) c.pointsOfInterest = [{ x, y }];
      if (focusModes.includes("single-shot")) c.focusMode = "single-shot";
      else if (focusModes.includes("continuous")) c.focusMode = "continuous";
      if (!Object.keys(c).length) return;
      await apply(c);
      if (c.focusMode === "single-shot" && focusModes.includes("continuous")) {
        setTimeout(() => apply({ focusMode: "continuous" }), 1500);
      }
    },
  };
}

async function openCamera(video, width, height) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints(width, height));
  } catch (e) {
    if (e?.name !== "OverconstrainedError") throw e;
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
  }
  video.srcObject = stream;
  video.setAttribute("playsinline", "");
  await video.play();
  return stream;
}

// Démarre la lecture. Renvoie les réglages caméra disponibles (lampe, zoom, mise au point).
// Le détecteur natif existe sur certains Android sans savoir lire les EAN
// (pas de Google Play services, navigateur dérivé…) : il ne détecte alors
// jamais rien, sans erreur. On vérifie les formats qu'il annonce.
async function nativeDetectorUsable() {
  if (!("BarcodeDetector" in window)) return false;
  try {
    const formats = await BarcodeDetector.getSupportedFormats();
    return formats.includes("ean_13");
  } catch {
    return false;
  }
}

// Boucle ZXing : à chaque passage on recopie l'image courante dans un canvas à
// la taille réelle de la vidéo (réduite à 1280 px de large), puis on décode.
// (Le lecteur « Browser » de ZXing figeait la taille du canvas à la première
// image : si la caméra changeait de définition ensuite — fréquent après
// l'autofocus ou le zoom — il ne voyait plus qu'un coin de l'image.)
function startZXingLoop(session, video, found, interval) {
  const hints = new Map();
  const F = ZXing.BarcodeFormat;
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E]);
  hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
  const reader = new ZXing.MultiFormatReader();
  reader.setHints(hints);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let invert = false;
  const loop = () => {
    if (session.stopped) return;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (video.readyState >= 2 && vw && vh) {
      const scale = Math.min(1, 1280 / vw);
      const w = Math.round(vw * scale), h = Math.round(vh * scale);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      ctx.drawImage(video, 0, 0, w, h);
      try {
        // une image sur deux en couleurs inversées (codes clairs sur fond foncé)
        const lum = new ZXing.HTMLCanvasElementLuminanceSource(canvas, invert);
        found(reader.decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(lum))).getText());
      } catch {}
      invert = !invert;
    }
    if (!session.stopped) session.timer = setTimeout(loop, interval);
  };
  loop();
}

// Démarre la lecture. Renvoie les réglages caméra disponibles (lampe, zoom,
// mise au point) et le lecteur utilisé.
export async function startScanner(video, onCode) {
  stopScanner();
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Caméra indisponible : la page doit être servie en HTTPS.");
  }
  const session = { stopped: false, stream: null, timer: 0, backup: 0 };
  current = session;
  // Un code n'est accepté que s'il a une clé de contrôle valide et qu'il est
  // lu deux fois de suite : évite les lectures partielles (« produit absent »).
  // Les deux lecteurs peuvent contribuer aux deux lectures.
  let last = null, hits = 0, lastAt = 0;
  const found = (raw) => {
    if (session.stopped) return;
    const code = String(raw).trim();
    if (!isValidCode(code)) return;
    const now = performance.now();
    if (code === last && now - lastAt < 1500) hits++;
    else { last = code; hits = 1; }
    lastAt = now;
    if (hits < 2) return;
    stopScanner();
    onCode(code);
  };

  try {
    const native = await nativeDetectorUsable();
    if (native) {
      session.stream = await openCamera(video, 1920, 1080);
      if (session.stopped) { stopScanner(); return null; }
      const det = new BarcodeDetector({ formats: FORMATS });
      // La boucle continue après une lecture : il en faut deux identiques.
      const tick = async () => {
        if (session.stopped) return;
        try {
          for (const c of await det.detect(video)) found(c.rawValue);
        } catch {}
        if (!session.stopped) requestAnimationFrame(tick);
      };
      tick();
      // Filet de sécurité : si le natif n'a rien lu au bout de 2,5 s,
      // ZXing tourne aussi en parallèle (plus lentement).
      session.backup = setTimeout(() => {
        loadZXing().then(() => { if (!session.stopped) startZXingLoop(session, video, found, 250); }).catch(() => {});
      }, 2500);
      return { ...makeControls(session.stream.getVideoTracks()[0]), engine: "natif" };
    }

    // ZXing seul (iPhone, Firefox, Android sans détecteur EAN).
    const [stream] = await Promise.all([openCamera(video, 1280, 720), loadZXing()]);
    session.stream = stream;
    if (session.stopped) { stopScanner(); return null; }
    startZXingLoop(session, video, found, 100);
    return { ...makeControls(stream.getVideoTracks()[0]), engine: "ZXing" };
  } catch (e) {
    stopScanner();
    throw cameraError(e);
  }
}

export function stopScanner() {
  if (!current) return;
  current.stopped = true;
  clearTimeout(current.timer);
  clearTimeout(current.backup);
  current.stream?.getTracks().forEach((t) => t.stop());
  current = null;
}
