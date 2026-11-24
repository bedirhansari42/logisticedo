/* Güncelleme denetimi: arayüz tarafı. Ağ isteğini ana süreç yapar (window.lgxUpdate, preload.js); burada yalnızca köprü çağrısı,
   sonucun durumlara eşlenmesi ve yüklü sürüm bilgisi vardır. Tarayıcıda geliştirirken köprü yoktur: her şey "unavailable". */
import { useEffect, useState } from "react";
import { isNewer, normalizeVersion } from "./version.mjs";
import { isEnabled } from "./state.mjs";

/** Masaüstü köprüsü ya da null (tarayıcıda). */
export function updateApi() {
  return (typeof window !== "undefined" && window.lgxUpdate) || null;
}

const REASONS = ["rate_limit", "not_found", "network"];

/** status: unavailable (köprü yok) | off (otomatik denetim kapalı) | error (reason: rate_limit | not_found | network | unknown) | current | newer. Asla fırlatmaz. */
export async function checkForUpdate({ manual = false } = {}) {
  const api = updateApi();
  if (!api) return { status: "unavailable", current: "" };
  if (!manual && !isEnabled()) return { status: "off", current: "" };
  try {
    const r = await api.check();
    const current = typeof r?.current === "string" ? r.current : "";
    if (!r || r.error || !r.latest) return { status: "error", current, reason: REASONS.includes(r?.reason) ? r.reason : "unknown" };
    if (!isNewer(r.latest.tag, current)) return { status: "current", current };
    return { status: "newer", current, latest: { version: normalizeVersion(r.latest.tag), url: r.latest.url } };
  } catch {
    return { status: "error", current: "", reason: "unknown" };
  }
}

export async function openRelease(url) {
  const api = updateApi();
  if (!api) return false;
  try { return (await api.open(url)) === true; } catch { return false; }
}

// ---- Uygulama içinden kurulum. Hiçbiri fırlatmaz; köprü yoksa ya da eskiyse sessizce başarısız olur. ----
const FAIL = { ok: false, reason: "unknown" };
const norm = (r) => (r && typeof r === "object" && typeof r.ok === "boolean" ? (r.ok ? { ok: true } : { ok: false, reason: typeof r.reason === "string" ? r.reason : "unknown" }) : FAIL);

export const canUseInstall = () => typeof updateApi()?.install === "function";

async function call(name) {
  const api = updateApi();
  if (typeof api?.[name] !== "function") return FAIL;
  try { return norm(await api[name]()); } catch { return FAIL; }
}
export const startInstall = () => call("install");
export const applyInstall = () => call("apply");
export async function cancelInstall() {
  try { return (await updateApi()?.cancel?.()) === true; } catch { return false; }
}
/** Köprüden ilerleme olaylarını dinler; dönen işlev aboneliği bırakır. */
export function onInstallProgress(cb) {
  try { const off = updateApi()?.onProgress?.(cb); return typeof off === "function" ? off : () => {}; } catch { return () => {}; }
}

/** Yüklü uygulamanın sürümü: önce derleme sürümü, köprü varsa ana sürecin (app.getVersion) cevabı. */
export function useAppVersion() {
  const [v, setV] = useState(typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "");
  useEffect(() => {
    const api = updateApi();
    if (!api) return;
    let alive = true;
    api.version().then((x) => { if (alive && x) setV(x); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return v;
}
