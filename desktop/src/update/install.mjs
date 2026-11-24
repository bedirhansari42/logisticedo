/* Uygulama içinden kurulumun arayüz durumu (saf mantık). Ana süreçten gelen olaylar `lgx:update:progress` yükleridir:
   { state: "downloading"|"ready"|"error"|"idle", percent?, reason? }. */
export const initialInstall = { phase: "offer", percent: 0, reason: "" };

const REASONS = ["no_asset", "digest", "size", "network", "disk", "portable", "not_writable", "aborted", "unknown"];
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

export function nextInstall(state, ev) {
  if (!ev || typeof ev !== "object") return state;
  if (ev.type === "reset") return initialInstall;
  if (ev.type === "start") return { phase: "downloading", percent: 0, reason: "" };
  if (ev.type !== "progress") return state;
  const pct = typeof ev.percent === "number" && Number.isFinite(ev.percent) ? clamp(ev.percent) : state.percent;
  switch (ev.state) {
    case "downloading": return { phase: "downloading", percent: pct, reason: "" };
    case "ready": return { phase: "ready", percent: 100, reason: "" };
    case "error": return { phase: "error", percent: state.percent, reason: REASONS.includes(ev.reason) ? ev.reason : "unknown" };
    case "idle": return initialInstall;
    default: return state;
  }
}

/** Düğme "Güncelle" mi olsun, yoksa eski "Tarayıcıda aç" mı. */
export const canInstall = ({ hasBridge, portable = false }) => !!hasBridge && !portable;
