/* Yedek hatırlatma kararı: son yedek 24 saatten eskiyse uyar; "Sonra hatırlat" 1 saat erteler.
   Erteleme bu bilgisayara özgüdür, localStorage'da `lgx.backupRemind`. Son yedek zamanı `auto.mjs` içindeki `lastAt`'tir. */

export const REMIND_KEY = "lgx.backupRemind";
export const REMIND_AFTER_MS = 24 * 3600 * 1000;
export const SNOOZE_MS = 3600 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/** hasData yoksa (boş kurulum) hiç uyarmaz. Saat oynanmışsa (gelecekteki lastAt, çok uzak erteleme) güvenli tarafta kalır: uyarır. */
export function needsReminder({ lastAt, snoozedUntil, hasData, now }) {
  if (!hasData) return false;
  if (snoozedUntil > now && snoozedUntil - now <= SNOOZE_MS) return false;
  if (!(lastAt > 0)) return true;
  if (lastAt > now + CLOCK_SKEW_MS) return true;
  return now - lastAt >= REMIND_AFTER_MS;
}

export function loadSnooze() {
  try {
    const v = Number(globalThis.localStorage?.getItem(REMIND_KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

export function snooze(now = Date.now()) {
  const until = now + SNOOZE_MS;
  try { globalThis.localStorage?.setItem(REMIND_KEY, String(until)); } catch { /* yoksay */ }
  return until;
}

export function clearSnooze() {
  try { globalThis.localStorage?.removeItem(REMIND_KEY); } catch { /* yoksay */ }
}

/** "Son yedek ne kadar önce": 48 saatten azsa saat, değilse gün (aşağı yuvarlanır). */
export function ago(lastAt, now) {
  const hours = Math.floor((now - lastAt) / 3600000);
  return hours < 48 ? { unit: "h", n: hours } : { unit: "d", n: Math.floor(hours / 24) };
}
