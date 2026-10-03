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

export async function startScanner(video, onCode) {
  stopScanner();
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Caméra indisponible : la page doit être servie en HTTPS.");
  }
  const session = { stopped: false, stream: null, reader: null };
  current = session;
  // Un code n'est accepté que s'il a une clé de contrôle valide et qu'il est
  // lu deux fois de suite : évite les lectures partielles (« produit absent »).
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
    if ("BarcodeDetector" in window) {
      session.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (session.stopped) return stopScanner();
      video.srcObject = session.stream;
      await video.play();
      const det = new BarcodeDetector({ formats: FORMATS });
      const tick = async () => {
        if (session.stopped) return;
        try {
          const codes = await det.detect(video);
          if (codes.length) return found(codes[0].rawValue);
        } catch {}
        requestAnimationFrame(tick);
      };
      tick();
      return;
    }

    await loadZXing();
    if (session.stopped) return;
    const hints = new Map();
    const F = ZXing.BarcodeFormat;
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E]);
    session.reader = new ZXing.BrowserMultiFormatReader(hints);
    await session.reader.decodeFromConstraints({ video: { facingMode: "environment" } }, video, (res) => {
      if (res) found(res.getText());
    });
  } catch (e) {
    stopScanner();
    throw cameraError(e);
  }
}

export function stopScanner() {
  if (!current) return;
  current.stopped = true;
  current.stream?.getTracks().forEach((t) => t.stop());
  try { current.reader?.reset(); } catch {}
  current = null;
}
