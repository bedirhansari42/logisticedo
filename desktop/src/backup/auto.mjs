/* Otomatik yedek ayarı (bu bilgisayara özgü: klasör yolu yedek dosyasına girmez). localStorage'da `lgx.autobackup`. */

export const AUTO_KEY = "lgx.autobackup";
export const HOURS = [1, 3, 6, 12, 24];
const RETRY_MS = 10 * 60 * 1000;

export const defaultAuto = () => ({ enabled: false, hours: 6, dir: "", lastAt: 0, lastTry: 0, lastError: "", lastFile: "" });

export function loadAuto() {
  const d = defaultAuto();
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(AUTO_KEY) || "null");
    if (!raw || typeof raw !== "object") return d;
    const num = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);
    const str = (v) => (typeof v === "string" ? v : "");
    return {
      enabled: raw.enabled === true,
      hours: HOURS.includes(raw.hours) ? raw.hours : d.hours,
      dir: str(raw.dir), lastAt: num(raw.lastAt), lastTry: num(raw.lastTry), lastError: str(raw.lastError), lastFile: str(raw.lastFile)
    };
  } catch {
    return d;
  }
}

/** Yedeği alma zamanı geldi mi? Hata sonrası 10 dakika bekler (her dakika yeniden denemez). */
export function isDue(cfg, now = Date.now()) {
  if (!cfg.enabled || !cfg.dir) return false;
  if (cfg.lastError) return now - cfg.lastTry >= RETRY_MS;
  return now - cfg.lastAt >= cfg.hours * 3600 * 1000;
}

let cache = null;
const listeners = new Set();
export const getAuto = () => (cache ??= loadAuto());
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function saveAuto(patch) {
  cache = { ...getAuto(), ...patch };
  try { globalThis.localStorage?.setItem(AUTO_KEY, JSON.stringify(cache)); } catch { /* yoksay */ }
  listeners.forEach((fn) => fn());
  return cache;
}
