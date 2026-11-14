import { useState } from "react";
import { useT, getLang } from "../lib/i18n.js";
import { useApp } from "../lib/app-context.jsx";
import { go } from "../lib/router.js";
import { parseProforma } from "@engine/parse/index.js";
import { newItem } from "@engine/doc-model.js";
import { applyParsed, freshState, newShipmentRecord } from "../lib/shipment-state.js";
import { applyCompanyToState, companyProfile, pickBank } from "../lib/company.js";
import { Dropzone } from "../components/Dropzone.jsx";
import { ProformaPicker } from "../components/ProformaPicker.jsx";
import { shipmentFromProforma } from "../lib/proforma-records.js";
import { ParseReport, buildParseSummary } from "../components/ParseReport.jsx";
import { Icon } from "../components/Icons.jsx";

export function NewShipment() {
  const t = useT();
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { id, parse } | { error, name } | { reading }
  const [companyId, setCompanyId] = useState(app.lastCompanyId);
  const company = app.getCompany(companyId);
  const [lhId, setLhId] = useState(() => { const c = app.getCompany(app.lastCompanyId); return c?.lhId && app.getLetterhead(c.lhId) ? c.lhId : app.defaultLhId; });
  const lh = app.getLetterhead(lhId);
  const onCompany = (value) => {
    setCompanyId(value);
    const c = app.getCompany(value);
    if (c?.lhId && app.getLetterhead(c.lhId)) setLhId(c.lhId); // şirketin varsayılan anteti
  };
  const prev = app.shipments[0]?.state || null;

  const create = async (state, auto, parse) => {
    if (company) {
      applyCompanyToState(state, company, pickBank(company, state.meta.currency)); // seçilen şirket satıcı, imza ve para birimine uyan hesabı yazar
      app.setLastCompany(company.id);
    }
    const rec = newShipmentRecord({ state, auto, lhId: lh ? lh.id : null, parse, companyId: company ? company.id : null });
    rec.lang = getLang();
    await app.saveShipment(rec);
    return rec;
  };

  const onFile = async (file) => {
    setBusy(true);
    setResult({ reading: file.name });
    try {
      const res = await parseProforma(file);
      const { state, auto } = applyParsed(res, { prev, profile: company ? companyProfile(company, "") : lh?.profile });
      const parse = buildParseSummary(file.name, res);
      const rec = await create(state, auto, parse);
      setResult({ id: rec.id, parse });
    } catch (e) {
      console.error(e);
      setResult({ error: e.key ? t(e.key, e.vars) : t("warn.failed", { msg: e.message || String(e) }), name: file.name });
    } finally {
      setBusy(false);
    }
  };

  const blank = async () => {
    const state = freshState({ prev, profile: company ? companyProfile(company, "") : lh?.profile });
    state.items.push(newItem());
    const rec = await create(state, new Set(), null);
    go(`/s/${rec.id}`);
  };

  const pickProforma = async (pf) => {
    const rec = shipmentFromProforma(pf, { companyId: company ? company.id : undefined, lhId: lh ? lh.id : undefined }); // sayfadaki şirket/antet seçimi doluysa o kazanır
    await app.saveShipment(rec);
    go(`/s/${rec.id}`);
  };

  return (
    <div className="page page--narrow">
      <header className="page-head">
        <div><h1>{t("d.new.title")}</h1><p className="muted">{t("d.new.lead")}</p></div>
      </header>

      <section className="card-block pad">
        <div className="field">
          <label htmlFor="newCo">{t("co.shipCompany")}</label>
          <select id="newCo" className="select" value={company ? company.id : "none"} onChange={(e) => onCompany(e.target.value)}>
            <option value="none">{t("co.noCompany")}</option>
            {app.companies.map((c) => <option key={c.id} value={c.id}>{c.name || t("co.untitled")}</option>)}
          </select>
          {app.companies.length === 0 && <p className="muted">{t("co.empty").split(".")[0]}. <a className="link" href="#/companies">{t("d.nav.companies")}</a></p>}
        </div>
        <div className="field">
          <label htmlFor="newLh">{t("d.new.letterhead")}</label>
          <select id="newLh" className="select" value={lhId} onChange={(e) => setLhId(e.target.value)}>
            <option value="none">{t("lh.none")}</option>
            {app.letterheads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {app.letterheads.length === 0 && <p className="muted">{t("d.new.noLh")} <a className="link" href="#/letterheads">{t("d.dash.addLh")}</a></p>}
        </div>
      </section>

      <section className="card-block pad">
        <h2 className="block-title">{t("pf.title")}</h2>
        <p className="muted">{t("pf.desc")}</p>
        <Dropzone onFile={onFile} busy={busy} accept=".pdf,.xlsx,.xlsm,.xls,.csv,.ods,.docx,application/pdf" title={t("pf.drop")} sub={t("pf.formats")} />
        {result?.reading && <p className="pr-file muted">{t("pf.reading", { file: result.reading })}</p>}
        {result?.error && (
          <ul className="pr-warnings parse-result"><li className="lvl-error"><Icon name="error" /><span><strong>{result.name}</strong> — {result.error}</span></li></ul>
        )}
        {result?.parse && (
          <>
            <ParseReport parse={result.parse} />
            <div><button className="btn btn--primary" type="button" onClick={() => go(`/s/${result.id}`)}>{t("d.new.open")}<Icon name="chevron" /></button></div>
          </>
        )}
        <div className="pf-alt">
          <span className="muted">{t("pf.or")}</span>
          <button className="btn btn--ghost btn--sm" type="button" onClick={blank}>{t("pf.blank")}</button>
        </div>
      </section>

      <section className="card-block pad">
        <h2 className="block-title">{t("d.pf.pick.title")}</h2>
        <p className="muted">{t("d.pf.pick.lead")}</p>
        <ProformaPicker onPick={pickProforma} />
      </section>
    </div>
  );
}
