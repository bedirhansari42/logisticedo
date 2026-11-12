import { useState } from "react";
import { toast } from "@common";
import { useT } from "../lib/i18n.js";
import { useApp } from "../lib/app-context.jsx";
import { newBank } from "../lib/company.js";
import { LISTS } from "../components/form/ListInput.jsx";
import { Icon } from "../components/Icons.jsx";

export function Banks() {
  const t = useT();
  const app = useApp();
  const [companyId, setCompanyId] = useState(app.lastCompanyId !== "none" ? app.lastCompanyId : app.companies[0]?.id || "");
  const company = app.getCompany(companyId) || app.companies[0] || null;
  const [banks, setBanks] = useState(null); // null: şirketin kayıtlı hesapları gösterilir
  const shown = banks ?? company?.banks ?? [];
  const dirty = banks !== null && JSON.stringify(banks) !== JSON.stringify(company?.banks || []);

  const pick = (id) => {
    if (dirty && !window.confirm(t("co.unsaved"))) return;
    setCompanyId(id);
    setBanks(null);
  };
  const edit = (fn) => setBanks(fn(structuredClone(shown)));
  const setBank = (id, patch) => edit((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const add = () => edit((list) => [...list, { ...newBank(), accountName: company?.name || "", isDefault: false }]);
  const remove = (id) => edit((list) => list.filter((b) => b.id !== id));
  // Aynı para biriminde tek varsayılan
  const setDefault = (id, on) => edit((list) => {
    const cur = String(list.find((b) => b.id === id)?.currency || "").trim().toUpperCase();
    return list.map((b) => (b.id === id ? { ...b, isDefault: on } : on && String(b.currency || "").trim().toUpperCase() === cur ? { ...b, isDefault: false } : b));
  });

  const save = async () => {
    if (shown.some((b) => !String(b.currency).trim())) { toast(t("bk.curReq"), "warn"); return; }
    await app.saveCompany({ ...company, banks: shown });
    setBanks(null);
    toast(t("bk.saved"));
  };

  if (!company) {
    return (
      <div className="page">
        <header className="page-head"><div><h1>{t("bk.title")}</h1><p className="muted">{t("bk.lead")}</p></div></header>
        <section className="card-block pad"><p className="muted">{t("bk.noCompany")} <a className="link" href="#/companies">{t("d.nav.companies")}</a></p></section>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head"><div><h1>{t("bk.title")}</h1><p className="muted">{t("bk.lead")}</p></div></header>
      <section className="card-block pad">
        <div className="field bk-company">
          <label htmlFor="bkCo">{t("bk.company")}</label>
          <select id="bkCo" className="select" value={company.id} onChange={(e) => pick(e.target.value)}>
            {app.companies.map((c) => <option key={c.id} value={c.id}>{c.name || t("co.untitled")}</option>)}
          </select>
        </div>
        <div className="block-head">
          <h2 className="block-title">{t("bk.accounts")}</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={add}><Icon name="plus" />{t("bk.add")}</button>
        </div>
        <p className="muted pl-hint">{t("bk.defaultHint")}</p>
        {shown.length === 0 && <p className="muted">{t("bk.empty")}</p>}
        {shown.map((b) => (
          <div className="bk-card" key={b.id}>
            <div className="fgrid fgrid--3">
              <div className="field"><label>{t("bk.cur")}</label>
                <select className="select" value={b.currency} onChange={(e) => setBank(b.id, { currency: e.target.value })}>
                  <option value="">—</option>
                  {b.currency && !LISTS["dl-currency"].includes(b.currency) && <option value={b.currency}>{b.currency}</option>}
                  {LISTS["dl-currency"].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field"><label>{t("bk.bank")}</label><input className="input" value={b.bankName} onChange={(e) => setBank(b.id, { bankName: e.target.value })} /></div>
              <div className="field"><label>{t("bk.branch")}</label><input className="input" value={b.branch} onChange={(e) => setBank(b.id, { branch: e.target.value })} /></div>
              <div className="field"><label>{t("bk.holder")}</label><input className="input" value={b.accountName} onChange={(e) => setBank(b.id, { accountName: e.target.value })} /></div>
              <div className="field"><label>{t("bk.iban")}</label><input className="input mono-num" value={b.iban} onChange={(e) => setBank(b.id, { iban: e.target.value.toUpperCase() })} /></div>
              <div className="field"><label>{t("bk.swift")}</label><input className="input mono-num" value={b.swift} onChange={(e) => setBank(b.id, { swift: e.target.value.toUpperCase() })} /></div>
              <div className="field"><label>{t("bk.accNo")}</label><input className="input mono-num" value={b.accountNo} onChange={(e) => setBank(b.id, { accountNo: e.target.value })} /></div>
            </div>
            <div className="bk-foot">
              <label className="check"><input type="checkbox" checked={!!b.isDefault} onChange={(e) => setDefault(b.id, e.target.checked)} />{t("bk.default")}</label>
              <button type="button" className="btn btn--quiet btn--sm btn--danger" onClick={() => remove(b.id)}><Icon name="trash" />{t("bk.remove")}</button>
            </div>
          </div>
        ))}
        <div className="co-actions">
          <button type="button" className="btn btn--primary" onClick={save} disabled={!dirty}>{t("co.save")}</button>
          {dirty && <span className="warn-text">{t("co.unsavedNote")}</span>}
        </div>
      </section>
    </div>
  );
}
