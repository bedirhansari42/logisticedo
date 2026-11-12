/* Uygulama genelindeki veri: antetler, sevkiyat listesi, varsayılan antet. IndexedDB'den yüklenir. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as store from "@engine/store.js";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const byUpdated = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);

export function AppProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const [letterheads, setLetterheads] = useState([]);
  const [defaultLhId, setDefaultLhId] = useState("none");
  const [shipments, setShipments] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const ok = await store.isPersistentAvailable();
      const lhs = await store.listLetterheads();
      const id = await store.kvGet("lhId");
      const ships = await store.listShipments();
      if (!alive) return;
      setPersistent(ok);
      setLetterheads(lhs);
      if (id && lhs.some((l) => l.id === id)) setDefaultLhId(id);
      setShipments(ships);
      setReady(true);
      store.requestPersistence();
    })();
    return () => { alive = false; };
  }, []);

  const setDefaultLh = useCallback((id) => { setDefaultLhId(id); store.kvSet("lhId", id); }, []);

  const saveLetterhead = useCallback(async (rec) => {
    const ok = await store.saveLetterhead(rec);
    setLetterheads((list) => [rec, ...list.filter((l) => l.id !== rec.id)].sort(byUpdated));
    return ok;
  }, []);

  const deleteLetterhead = useCallback(async (id) => {
    await store.deleteLetterhead(id);
    setLetterheads((list) => list.filter((l) => l.id !== id));
    setDefaultLhId((cur) => { if (cur === id) { store.kvSet("lhId", "none"); return "none"; } return cur; });
  }, []);

  const saveShipment = useCallback(async (rec) => {
    const ok = await store.saveShipment(rec);
    setShipments((list) => [rec, ...list.filter((s) => s.id !== rec.id)].sort(byUpdated));
    return ok;
  }, []);

  const deleteShipment = useCallback(async (id) => {
    await store.deleteShipment(id);
    setShipments((list) => list.filter((s) => s.id !== id));
  }, []);

  const value = useMemo(() => ({
    ready, persistent, letterheads, defaultLhId, setDefaultLh, saveLetterhead, deleteLetterhead,
    shipments, saveShipment, deleteShipment,
    getLetterhead: (id) => letterheads.find((l) => l.id === id) || null
  }), [ready, persistent, letterheads, defaultLhId, shipments, setDefaultLh, saveLetterhead, deleteLetterhead, saveShipment, deleteShipment]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
