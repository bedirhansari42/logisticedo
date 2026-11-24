/* Güncelleme bildirimi ayarları ve kararı (bu bilgisayara özgü, localStorage). Kural: `backup/reminder.mjs` ile aynı try/catch kalıbı. */
import { isNewer, normalizeVersion } from "./version.mjs";

export const ENABLED_KEY = "lgx.update.enabled";
export const SKIP_KEY = "lgx.update.skip";

/** Varsayılan açık; yalnızca kullanıcı kapattıysa ("0") false. */
export function isEnabled() {
  try { return globalThis.localStorage?.getItem(ENABLED_KEY) !== "0"; } catch { return true; }
}

export function setEnabled(on) {
  try {
    if (on) globalThis.localStorage?.removeItem(ENABLED_KEY);
    else globalThis.localStorage?.setItem(ENABLED_KEY, "0");
  } catch { /* yoksay */ }
}

export function loadSkipped() {
  try { return globalThis.localStorage?.getItem(SKIP_KEY) || ""; } catch { return ""; }
}

export function skipVersion(version) {
  const v = normalizeVersion(version);
  if (!v) return;
  try { globalThis.localStorage?.setItem(SKIP_KEY, v); } catch { /* yoksay */ }
}

/** Pencere çıksın mı? Yeni kararlı sürüm var ve ne kalıcı olarak atlanmış ("skipped") ne de bu oturumda ertelenmiş ("dismissed"). */
export function shouldNotify({ latest, current, skipped, dismissed }) {
  if (!isNewer(latest, current)) return false;
  const v = normalizeVersion(latest);
  return v !== skipped && v !== dismissed;
}
