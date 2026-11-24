/* Güncelleme denetimi: arayüz tarafı. Ağ isteğini ana süreç yapar (window.lgxUpdate, preload.js); burada yalnızca köprü çağrısı,
   sonucun durumlara eşlenmesi ve yüklü sürüm bilgisi vardır. Tarayıcıda geliştirirken köprü yoktur: her şey "unavailable". */
import { useEffect, useState } from "react";
import { isNewer, normalizeVersion } from "./version.mjs";
import { isEnabled } from "./state.mjs";

/** Masaüstü köprüsü ya da null (tarayıcıda). */
export function updateApi() {
  return (typeof window !== "undefined" && window.lgxUpdate) || null;
}

/** status: unavailable (köprü yok) | off (otomatik denetim kapalı) | error | current | newer. Asla fırlatmaz. */
export async function checkForUpdate({ manual = false } = {}) {
  const api = updateApi();
  if (!api) return { status: "unavailable", current: "" };
  if (!manual && !isEnabled()) return { status: "off", current: "" };
  try {
    const r = await api.check();
    const current = typeof r?.current === "string" ? r.current : "";
    if (!r || r.error || !r.latest) return { status: "error", current };
    if (!isNewer(r.latest.tag, current)) return { status: "current", current };
    return { status: "newer", current, latest: { version: normalizeVersion(r.latest.tag), url: r.latest.url } };
  } catch {
    return { status: "error", current: "" };
  }
}

export async function openRelease(url) {
  const api = updateApi();
  if (!api) return false;
  try { return (await api.open(url)) === true; } catch { return false; }
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
