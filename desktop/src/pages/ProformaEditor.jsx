import { useEffect, useMemo, useState } from "react";
import { toast } from "@common";
import { useT } from "../lib/i18n.js";
import { useApp } from "../lib/app-context.jsx";
import { go } from "../lib/router.js";
import { useProforma } from "../lib/use-proforma.js";
import { useRecordPickers } from "../lib/record-pickers.js";
import { buildDownload, saveBlob } from "../lib/download.js";
import { bankLabel } from "../lib/company.js";
import { computeTotals, fmtUi, missingProforma } from "@engine/doc-model.js";
import { FormSection } from "../components/form/Sections.jsx";
import { ProformaNotes } from "../components/form/ProformaNotes.jsx";
import { Preview } from "../components/Preview.jsx";
import { ParseReport } from "../components/ParseReport.jsx";
import { Icon, Spinner } from "../components/Icons.jsx";

// boşlukla ayrılmış: çeviri denetimi tırnaklı çiftleri anahtar sanıyor
const list = (x) => x.split(" ");
const PF_A = list("meta.proformaNo meta.proformaDate meta.orderRef meta.currency");
const PF_C = list("shipment.incoterm shipment.incotermPlace shipment.paymentTerms shipment.transportMode shipment.portLoading shipment.portDischarge shipment.countryOrigin shipment.countryDestination");
const PF_H = list("sign.name sign.title sign.place");
/* Adımlar: form-schema bölüm harfleri (yalnızca belirtilen alanlar) ve notlar kartı */
const STEPS = {
  general: [{ l: "A", only: PF_A }, { l: "B" }, { l: "C", only: PF_C }],
  items: [{ l: "D" }, { l: "E" }],
  bank: [{ l: "G" }, { l: "H", only: PF_H }, { notes: true }]
};
const STEP_KEYS = Object.keys(STEPS);

export function ProformaEditor({ id, step }) {
  const t = useT();
  const app = useApp();
  const pf = useProforma(id);
  const [busyKey, setBusyKey] = useState(null);
  const [parseHidden, setParseHidden] = useState(false);
  const [showPreview, setShowPreview] = useState(() => { try { return localStorage.getItem("lgx.preview") !== "0"; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem("lgx.preview", showPreview ? "1" : "0"); } catch { /* yoksay */ } }, [showPreview]);

  const state = pf.doc?.state;
  const lh = pf.meta?.lhId ? app.getLetterhead(pf.meta.lhId) : null;
  const company = pf.meta?.companyId ? app.getCompany(pf.meta.companyId) : null;
  const T = useMemo(() => (state ? computeTotals(state) : null), [state]);
  const { onCompany, onBank, onLetterhead } = useRecordPickers({ sh: pf, app, state, company, id, t });

  const ctx = useMemo(() => {
    if (!state) return null;
    return { state, auto: pf.doc.auto, update: pf.update, lh, T, itemView: "invoice", setItemView: () => {}, invoiceOnly: true, placeholders: { "charges.vat": T.vatCalc ? fmtUi(T.vatCalc, 2) : "" } };
  }, [state, pf.doc?.auto, pf.update, lh, T]);

  if (pf.status === "loading") return <div className="page page--center"><Spinner /></div>;
  if (pf.status === "missing") {
    return (
      <div className="page page--center">
        <div className="empty-state empty-state--sm"><p>{t("d.pf.missing")}</p><a className="btn btn--primary" href="#/proformas">{t("d.nav.proformas")}</a></div>
      </div>
    );
  }

  const active = STEP_KEYS.includes(step) ? step : "general";
  const title = state.meta.proformaNo.trim() || t("d.pf.untitled");
  const goStep = (k) => go(`/pf/${id}/${k}`);

  const onDownload = async (kind) => {
    setBusyKey(kind);
    try {
      const { blob, name } = await buildDownload(kind, state, lh);
      saveBlob(blob, name);
      toast(t("dl.ok", { file: name }));
    } catch (e) {
      console.error(e);
      toast(t("dl.fail", { msg: e.message || String(e) }), "error", 8000);
    } finally {
      setBusyKey(null);
    }
  };

  const stepStatus = (k) => {
    if (k === "general") return state.buyer.name && state.seller.name ? "ready" : state.buyer.name || state.seller.name ? "partial" : "empty";
    if (k === "items") return state.items.some((it) => it.description || it.qty) ? "ready" : "empty";
    return state.bank.iban || state.bank.bankName || state.sign.name ? "ready" : "empty";
  };

  return (
    <div className="editor">
      <header className="ed-head">
        <a className="btn btn--quiet btn--sm" href="#/proformas"><Icon name="back" />{t("d.nav.proformas")}</a>
        <div className="ed-title">
          <h1 title={title}>{title}</h1>
          {state.buyer.name && <span className="muted">{state.buyer.name}</span>}
          <span className="muted">{t(`d.pf.src.${pf.meta.source === "imported" ? "imported" : "created"}`)}</span>
          {pf.meta.file && <button type="button" className="btn btn--ghost btn--sm" onClick={() => saveBlob(pf.meta.file.blob, pf.meta.file.name)} title={pf.meta.file.name}>{t("d.pf.file")}</button>}
        </div>
        <span className={`save-state save-state--${pf.saving}`}><i />{pf.saving === "saved" ? t("d.saved") : t("d.saving")}</span>
        <button type="button" className="btn btn--ghost btn--sm" aria-pressed={showPreview} onClick={() => setShowPreview((v) => !v)} title={showPreview ? t("d.editor.hidePreview") : t("d.editor.showPreview")}>
          <Icon name="expand" /><span className="btn-text">{showPreview ? t("d.editor.hidePreview") : t("d.editor.showPreview")}</span>
        </button>
        <label className="ed-select">
          <span className="visually-hidden">{t("co.company")}</span>
          <select className="select" value={company ? company.id : "none"} onChange={(e) => onCompany(e.target.value)} title={t("co.company")}>
            <option value="none">{t("co.noCompany")}</option>
            {app.companies.map((c) => <option key={c.id} value={c.id}>{c.name || t("co.untitled")}</option>)}
          </select>
        </label>
        {company && company.banks.length > 0 && (
          <label className="ed-select">
            <span className="visually-hidden">{t("co.bank")}</span>
            <select className="select" value={pf.meta.bankAuto ? "auto" : pf.meta.bankId || "auto"} onChange={(e) => onBank(e.target.value)} title={t("co.bank")}>
              <option value="auto">{t("co.bankAuto")}</option>
              {company.banks.map((b) => <option key={b.id} value={b.id}>{bankLabel(b)}</option>)}
            </select>
          </label>
        )}
        <label className="ed-select">
          <span className="visually-hidden">{t("d.new.letterhead")}</span>
          <select className="select" value={lh ? lh.id : "none"} onChange={(e) => onLetterhead(e.target.value)}>
            <option value="none">{t("lh.none")}</option>
            {app.letterheads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      </header>

      <div className={`ed-body${showPreview ? "" : " no-preview"}`}>
        <nav className="ed-steps" aria-label={t("d.editor.steps")}>
          <p className="ed-group">{t("d.pf.title")}</p>
          {STEP_KEYS.map((k) => (
            <button key={k} type="button" className={`ed-step${active === k ? " is-active" : ""}`} onClick={() => goStep(k)}>
              <i className={`dot dot--${stepStatus(k)}`} aria-hidden="true" /><span>{t(`d.step.${k}`)}</span>
            </button>
          ))}
        </nav>

        <div className="ed-form ws-form">
          {active === "general" && pf.meta.parse && !parseHidden && <ParseReport parse={pf.meta.parse} onDismiss={() => setParseHidden(true)} />}
          {STEPS[active].map((p) => (p.notes ? <ProformaNotes key={`${active}-n`} ctx={ctx} /> : <FormSection key={`${active}-${p.l}`} letter={p.l} ctx={ctx} only={p.only} />))}
        </div>

        {showPreview && (
          <aside className="ed-preview" aria-label={t("pv.docLabel")}>
            <Preview state={state} lh={lh} doc="proforma" onDownload={onDownload} busyKey={busyKey} xlsxKind="proforma-xlsx" missing={missingProforma(state)} />
          </aside>
        )}
      </div>
    </div>
  );
}
