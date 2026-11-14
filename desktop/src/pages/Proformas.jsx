import { useMemo, useState } from "react";
import { toast } from "@common";
import { ICONS } from "@common";
import { useT, useLang } from "../lib/i18n.js";
import { useApp } from "../lib/app-context.jsx";
import { go } from "../lib/router.js";
import { createEmptyState, newItem } from "@engine/doc-model.js";
import { freshState } from "../lib/shipment-state.js";
import { applyCompanyToState, companyProfile, pickBank } from "../lib/company.js";
import { importProformaFile, newProformaRecord, proformaTitle, shipmentFromProforma } from "../lib/proforma-records.js";
import { nextProformaNo } from "../proforma/model.mjs";
import { saveBlob } from "../lib/download.js";
import { relTime, useMoney } from "../components/Status.jsx";
import { Dropzone } from "../components/Dropzone.jsx";
import { Icon } from "../components/Icons.jsx";

const ACCEPT = ".pdf,.xlsx,.xlsm,.xls,.csv,.ods,.docx,application/pdf";

export function Proformas() {
  const t = useT();
  const lang = useLang();
  const money = useMoney();
  const app = useApp();
  const { proformas, shipments, ready } = app;
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null); // { name, msg }

  const shipCount = useMemo(() => {
    const m = new Map();
    for (const s of shipments) if (s.proformaId) m.set(s.proformaId, (m.get(s.proformaId) || 0) + 1);
    return m;
  }, [shipments]);

  const rows = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase();
    if (!needle) return proformas;
    return proformas.filter((r) => [r.summary?.proformaNo, r.summary?.buyer, r.summary?.seller].some((v) => String(v || "").toLocaleLowerCase().includes(needle)));
  }, [proformas, q]);

  const company = app.getCompany(app.lastCompanyId);
  const lhId = company?.lhId && app.getLetterhead(company.lhId) ? company.lhId : app.defaultLhId;
  const lh = app.getLetterhead(lhId);
  const prev = proformas[0]?.state || null;
  const profile = company ? companyProfile(company, "") : lh?.profile;

  const create = async ({ state, auto, source, parse = null, file = null }) => {
    if (company) {
      applyCompanyToState(state, company, pickBank(company, state.meta.currency));
      app.setLastCompany(company.id);
    }
    const rec = newProformaRecord({ state, auto, source, lhId: lh ? lh.id : null, companyId: company ? company.id : null, parse, file });
    await app.saveProforma(rec);
    return rec;
  };

  const onNew = async () => {
    const state = freshState({ prev, profile });
    state.meta.proformaNo = nextProformaNo(proformas.map((p) => p.summary?.proformaNo));
    state.meta.proformaDate = createEmptyState().meta.invoiceDate;
    state.items.push(newItem());
    const rec = await create({ state, auto: new Set(), source: "created" });
    go(`/pf/${rec.id}`);
  };

  const onFile = async (file) => {
    setBusy(true);
    setError(null);
    try {
      const imp = await importProformaFile(file, { prev, profile });
      const rec = await create({ ...imp, source: "imported" });
      go(`/pf/${rec.id}`);
    } catch (e) {
      console.error(e);
      setError({ name: file.name, msg: e.key ? t(e.key, e.vars) : t("warn.failed", { msg: e.message || String(e) }) });
    } finally {
      setBusy(false);
    }
  };

  const onDuplicate = async (r) => {
    const state = structuredClone(r.state);
    state.meta.proformaNo = nextProformaNo(proformas.map((p) => p.summary?.proformaNo));
    state.meta.proformaDate = createEmptyState().meta.invoiceDate;
    const rec = newProformaRecord({ state, source: "created", lhId: r.lhId, companyId: r.companyId, bankId: r.bankId, bankAuto: r.bankAuto });
    await app.saveProforma(rec);
    toast(t("d.pf.duplicated"));
  };

  const onDelete = async (r) => {
    if (!window.confirm(t("d.pf.confirmDelete", { name: proformaTitle(r) || t("d.pf.untitled") }))) return;
    await app.deleteProforma(r.id);
    toast(t("d.pf.deleted"));
  };

  const onShipment = async (r) => {
    const rec = shipmentFromProforma(r);
    await app.saveShipment(rec);
    toast(t("d.pf.shipCreated"));
    go(`/s/${rec.id}`);
  };

  const onFileDownload = (r) => saveBlob(r.file.blob, r.file.name);

  if (!ready) return null;
  return (
    <div className="page">
      <header className="page-head">
        <div><h1>{t("d.pf.title")}</h1><p className="muted">{t("d.pf.count", { n: proformas.length })}</p></div>
        <button className="btn btn--primary" type="button" onClick={onNew}><Icon name="plus" />{t("d.pf.new")}</button>
      </header>
      <div className="toolbar">
        <label className="search">
          <Icon name="search" />
          <input className="input" type="search" placeholder={t("d.pf.search")} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <Dropzone compact onFile={onFile} busy={busy} accept={ACCEPT} title={t("d.pf.dropTitle")} sub={t("d.pf.dropSub")} />
      {error && (
        <ul className="pr-warnings parse-result"><li className="lvl-error"><Icon name="error" /><span><strong>{error.name}</strong> — {error.msg}</span></li></ul>
      )}
      {rows.length === 0 ? (
        <div className="empty-state empty-state--sm"><p>{proformas.length ? t("d.pf.noMatch") : t("d.pf.emptyText")}</p></div>
      ) : (
        <section className="card-block">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t("d.pf.colNo")}</th><th>{t("d.col.buyer")}</th><th className="num">{t("d.col.total")}</th>
                  <th>{t("d.pf.colShip")}</th><th>{t("d.col.updated")}</th><th className="it-act" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const s = r.summary || {};
                  const open = () => go(`/pf/${r.id}`);
                  const n = shipCount.get(r.id) || 0;
                  return (
                    <tr key={r.id} tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.key === "Enter") open(); }}>
                      <td className="clip"><strong>{proformaTitle(r) || t("d.pf.untitled")}</strong><span className="sub">{t(`d.pf.src.${r.source === "imported" ? "imported" : "created"}`)}</span></td>
                      <td className="clip" title={s.buyer || undefined}>{s.buyer || "—"}</td>
                      <td className="num">{money(s.total, s.currency)}</td>
                      <td>{n ? t("d.pf.shipCount", { n }) : "—"}</td>
                      <td className="muted">{relTime(r.updatedAt, t, lang)}</td>
                      <td className="it-act" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="icon-btn icon-btn--plain" title={t("d.pf.act.ship")} aria-label={t("d.pf.act.ship")} onClick={() => onShipment(r)}><Icon name="shipments" /></button>
                        {r.file && <button type="button" className="icon-btn icon-btn--plain" title={t("d.pf.act.file")} aria-label={t("d.pf.act.file")} onClick={() => onFileDownload(r)} dangerouslySetInnerHTML={{ __html: ICONS.download }} />}
                        <button type="button" className="icon-btn icon-btn--plain" title={t("d.act.dup")} aria-label={t("d.act.dup")} onClick={() => onDuplicate(r)} dangerouslySetInnerHTML={{ __html: ICONS.copy }} />
                        <button type="button" className="icon-btn icon-btn--plain icon-btn--danger" title={t("d.act.del")} aria-label={t("d.act.del")} onClick={() => onDelete(r)} dangerouslySetInnerHTML={{ __html: ICONS.trash }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
