/* Şirket / banka / antet seçimi: sevkiyat ve proforma editörlerinin ortak işleyicileri.
   sh: useRecord dönüşü; meta.companyId, bankId, bankAuto, lhId alanlarını kullanır. */
import { useEffect, useRef } from "react";
import { toast } from "@common";
import { applyProfileToState } from "./shipment-state.js";
import { applyCompanyToState, bankToState, pickBank } from "./company.js";

export function useRecordPickers({ sh, app, state, company, id, t }) {
  // Para birimi (ya da şirket) değişince, "otomatik" modda banka hesabı para birimine uyana döner.
  // Kayıt açılırken çalışmaz: elle düzenlenmiş banka bilgisi ezilmesin.
  const autoSeen = useRef(null);
  const currency = state?.meta.currency;
  useEffect(() => {
    if (!state || !sh.meta) return;
    const key = `${id}|${sh.meta.companyId}|${currency}|${sh.meta.bankAuto}|${sh.meta.bankId}`;
    const first = autoSeen.current === null || !autoSeen.current.startsWith(`${id}|`);
    const prev = autoSeen.current;
    autoSeen.current = key;
    if (first || prev === key || !company) return;
    const b = sh.meta.bankAuto ? pickBank(company, currency) : company.banks.find((x) => x.id === sh.meta.bankId);
    if (b) sh.update((d) => { d.bank = { ...d.bank, ...bankToState(b) }; });
  }, [id, currency, company, sh.meta?.companyId, sh.meta?.bankAuto, sh.meta?.bankId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onCompany = (value) => {
    const c = value === "none" ? null : app.getCompany(value);
    sh.updateMeta({ companyId: c ? c.id : null, bankId: null, bankAuto: true });
    if (!c) return;
    sh.update((d) => { applyCompanyToState(d, c, pickBank(c, d.meta.currency)); });
    if (c.lhId && app.getLetterhead(c.lhId)) sh.updateMeta({ lhId: c.lhId });
    app.setLastCompany(c.id);
    toast(t("co.applied", { name: c.name }), "info");
  };

  const onBank = (value) => {
    if (!company) return;
    if (value === "auto") {
      sh.updateMeta({ bankId: null, bankAuto: true });
      const b = pickBank(company, state.meta.currency);
      if (b) sh.update((d) => { d.bank = { ...d.bank, ...bankToState(b) }; });
      return;
    }
    const b = company.banks.find((x) => x.id === value);
    sh.updateMeta({ bankId: value, bankAuto: false });
    if (b) sh.update((d) => { d.bank = { ...d.bank, ...bankToState(b) }; });
  };

  const onLetterhead = (value) => {
    const next = value === "none" ? null : value;
    sh.updateMeta({ lhId: next });
    const rec = next ? app.getLetterhead(next) : null;
    if (rec?.profile && !company) {
      sh.update((d) => { applyProfileToState(d, rec.profile); });
      toast(t("lh.profileApplied"), "info");
    }
  };

  return { onCompany, onBank, onLetterhead };
}
