/* Koyu / açık tema. Seçim localStorage'da (lgx.theme) tutulur; varsayılan açık (kayıtlı bir seçimi olan kullanıcı kendi temasını korur).
   <html data-theme="dark|light"> ayarlanır, renkler dash.css'teki belirteçlerden gelir. */
import { useSyncExternalStore } from "react";

const KEY = "lgx.theme";
const THEMES = ["dark", "light"];
const listeners = new Set();

export function getTheme() {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    return THEMES.includes(v) ? v : "light";
  } catch {
    return "light";
  }
}

const apply = (theme) => { document.documentElement.dataset.theme = theme; };

/** Açılışta, ilk boyamadan önce çağrılır (boot.js). */
export function initTheme() { apply(getTheme()); }

export function setTheme(theme) {
  if (!THEMES.includes(theme)) return;
  try { globalThis.localStorage?.setItem(KEY, theme); } catch { /* yoksay */ }
  apply(theme);
  listeners.forEach((fn) => fn());
}

export const toggleTheme = () => setTheme(getTheme() === "dark" ? "light" : "dark");

export function useTheme() {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, getTheme);
}
