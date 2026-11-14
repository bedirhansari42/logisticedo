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
  const [proformas, setProformas] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [lastCompanyId, setLastCompanyId] = useState("none");

  useEffect(() => {
    let alive = true;
    (async () => {
      const ok = await store.isPersistentAvailable();
      const lhs = await store.listLetterheads();
      const id = await store.kvGet("lhId");
      const ships = await store.listShipments();
      const pfs = await store.listProformas();
      const cos = (await store.kvGet("companies")) || [];
      const coId = await store.kvGet("companyId");
      if (!alive) return;
      setPersistent(ok);
      setLetterheads(lhs);
      if (id && lhs.some((l) => l.id === id)) setDefaultLhId(id);
      setShipments(ships);
      setProformas(pfs);
      setCompanies(Array.isArray(cos) ? cos : []);
      if (coId && Array.isArray(cos) && cos.some((c) => c.id === coId)) setLastCompanyId(coId);
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

  const saveCompanies = useCallback(async (list) => {
    setCompanies(list);
    await store.kvSet("companies", list);
  }, []);

  const saveCompany = useCallback(async (rec) => {
    const next = { ...rec, updatedAt: Date.now() };
    await saveCompanies([...companies.filter((c) => c.id !== rec.id), next].sort((a, b) => a.name.localeCompare(b.name)));
    return next;
  }, [companies, saveCompanies]);

  const deleteCompany = useCallback(async (id) => {
    await saveCompanies(companies.filter((c) => c.id !== id));
    setLastCompanyId((cur) => { if (cur === id) { store.kvSet("companyId", "none"); return "none"; } return cur; });
  }, [companies, saveCompanies]);

  const setLastCompany = useCallback((id) => { setLastCompanyId(id); store.kvSet("companyId", id); }, []);

  const saveShipment = useCallback(async (rec) => {
    const ok = await store.saveShipment(rec);
    setShipments((list) => [rec, ...list.filter((s) => s.id !== rec.id)].sort(byUpdated));
    return ok;
  }, []);

  const deleteShipment = useCallback(async (id) => {
    await store.deleteShipment(id);
    setShipments((list) => list.filter((s) => s.id !== id));
  }, []);

  const saveProforma = useCallback(async (rec) => {
    const ok = await store.saveProforma(rec);
    setProformas((list) => [rec, ...list.filter((p) => p.id !== rec.id)].sort(byUpdated));
    return ok;
  }, []);

  const deleteProforma = useCallback(async (id) => {
    await store.deleteProforma(id);
    setProformas((list) => list.filter((p) => p.id !== id));
  }, []);

  const value = useMemo(() => ({
    ready, persistent, letterheads, defaultLhId, setDefaultLh, saveLetterhead, deleteLetterhead,
    shipments, saveShipment, deleteShipment,
    proformas, saveProforma, deleteProforma,
    getProforma: (id) => proformas.find((p) => p.id === id) || null,
    companies, lastCompanyId, setLastCompany, saveCompany, deleteCompany,
    getCompany: (id) => companies.find((c) => c.id === id) || null,
    getLetterhead: (id) => letterheads.find((l) => l.id === id) || null
  }), [ready, persistent, letterheads, defaultLhId, shipments, proformas, companies, lastCompanyId, setDefaultLh, saveLetterhead, deleteLetterhead, saveShipment, deleteShipment, saveProforma, deleteProforma, setLastCompany, saveCompany, deleteCompany]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
