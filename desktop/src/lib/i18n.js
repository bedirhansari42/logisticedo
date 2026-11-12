/* Arayüz metinleri: önce bu uygulamanın kendi sözlüğü (strings.js), yoksa motorun sözlüğü (i18n.js). */
import { useSyncExternalStore } from "react";
import { t as engineT, getLang, onLangChange, setLang } from "@i18n";
import { EXTRA } from "./strings.js";

export function tr(key, vars) {
  let s = EXTRA[getLang()]?.[key] ?? EXTRA.tr[key];
  if (s == null) return engineT(key, vars);
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return s;
}

const subscribe = (cb) => onLangChange(() => cb());

export function useLang() {
  return useSyncExternalStore(subscribe, getLang);
}

/** Dil değişince bileşeni yeniden çizer; t(key, vars) döner */
export function useT() {
  useLang();
  return tr;
}

export { getLang, setLang, onLangChange };
