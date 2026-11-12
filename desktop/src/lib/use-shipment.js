/* Bir sevkiyat kaydını yükler, düzenlemeleri tutar ve kendiliğinden kaydeder (debounce). */
import { useCallback, useEffect, useRef, useState } from "react";
import * as store from "@engine/store.js";
import { relocalize } from "@engine/doc-model.js";
import { getLang, onLangChange } from "@i18n";
import { migrate, summarize } from "./shipment-state.js";
import { useApp } from "./app-context.jsx";

const SAVE_DELAY = 500;

export function useShipment(id) {
  const { saveShipment } = useApp();
  const [status, setStatus] = useState("loading"); // loading | ready | missing
  const [meta, setMeta] = useState(null); // { id, status, lhId, createdAt, parse }
  const [doc, setDoc] = useState(null); // { state, auto: Set }
  const [saving, setSaving] = useState("saved"); // saved | dirty | saving
  const dirty = useRef(false);
  const latest = useRef({ meta: null, doc: null });
  latest.current = { meta, doc };

  useEffect(() => {
    let alive = true;
    dirty.current = false;
    setStatus("loading");
    (async () => {
      const rec = await store.getShipment(id);
      if (!alive) return;
      if (!rec) { setStatus("missing"); return; }
      const state = migrate(rec.state);
      if (rec.lang && rec.lang !== getLang()) relocalize(state, rec.lang, getLang());
      setMeta({ id: rec.id, status: rec.status, lhId: rec.lhId, companyId: rec.companyId || null, bankId: rec.bankId || null, bankAuto: rec.bankAuto !== false, createdAt: rec.createdAt, parse: rec.parse || null });
      setDoc({ state, auto: new Set(rec.auto || []) });
      setSaving("saved");
      setStatus("ready");
    })();
    return () => { alive = false; };
  }, [id]);

  const flush = useCallback(async () => {
    if (!dirty.current) return;
    const { meta: m, doc: d } = latest.current;
    if (!m || !d) return;
    dirty.current = false;
    await saveShipment({ ...m, updatedAt: Date.now(), lang: getLang(), state: d.state, auto: [...d.auto], summary: summarize(d.state) });
  }, [saveShipment]);

  // Değişiklikten SAVE_DELAY sonra kaydet
  useEffect(() => {
    if (!dirty.current) return undefined;
    setSaving("saving");
    const timer = setTimeout(async () => { await flush(); setSaving("saved"); }, SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [doc, meta, flush]);

  // Sayfadan ayrılırken bekleyen değişikliği hemen yaz
  useEffect(() => {
    const on = () => { flush(); };
    window.addEventListener("pagehide", on);
    return () => { window.removeEventListener("pagehide", on); flush(); };
  }, [flush, id]);

  const update = useCallback((fn) => {
    dirty.current = true;
    setDoc((prev) => {
      const state = structuredClone(prev.state);
      const auto = new Set(prev.auto);
      fn(state, auto);
      return { state, auto };
    });
  }, []);

  const updateMeta = useCallback((patch) => {
    dirty.current = true;
    setMeta((m) => ({ ...m, ...patch }));
  }, []);

  // Arayüz dili değişince sayılar yeni ondalık biçimine çevrilir (kullanıcı düzenlemesi sayılmaz)
  useEffect(() => onLangChange((lang, prev) => {
    setDoc((d) => { if (!d) return d; const state = structuredClone(d.state); relocalize(state, prev, lang); return { state, auto: d.auto }; });
  }), []);

  return { status, meta, doc, update, updateMeta, saving, flush };
}
