import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@common";
import { useT, getLang } from "../lib/i18n.js";
import { useApp } from "../lib/app-context.jsx";
import { go } from "../lib/router.js";
import { useShipment } from "../lib/use-shipment.js";
import { askConfirm } from "../lib/confirm.js";
import { ALL_DOCS, DOC_GROUPS, DOC_ONLY, DOC_SECTIONS, DOC_TITLE, STATUSES, STEPS, applyProfileToState, docStatus } from "../lib/shipment-state.js";
import { buildDownload, saveBlob } from "../lib/download.js";
import { computeTotals, fmtUi } from "@engine/doc-model.js";
import { FormSection } from "../components/form/Sections.jsx";
import { setField } from "../components/form/Field.jsx";
import { Preview } from "../components/Preview.jsx";
import { ParseReport } from "../components/ParseReport.jsx";
import { Icon, Spinner } from "../components/Icons.jsx";
import { applyCompanyToState, bankLabel, bankToState, pickBank } from "../lib/company.js";

const STEP_KEYS = Object.keys(STEPS);
const USES = { ci: [], si: ["items"], bl: ["items"], pl: ["general", "items"], pallet: ["items"], contract: ["general", "items", "bank"], bill: ["general", "items", "bank"] };

function stepStatus(state, step) {
  if (step === "general") return state.buyer.name && state.seller.name ? "ready" : state.buyer.name || state.seller.name ? "partial" : "empty";
  if (step === "items") return state.items.some((it) => it.description || it.qty) ? "ready" : "empty";
  return state.bank.iban || state.bank.bankName || state.sign.name ? "ready" : "empty";
}

function Dot({ s }) { return <i className={`dot dot--${s}`} aria-hidden="true" />; }

export function Editor({ id, step }) {
  const t = useT();
  const app = useApp();
  const sh = useShipment(id);
  const [itemView, setItemView] = useState("invoice");
  const [busyKey, setBusyKey] = useState(null);
  const [parseHidden, setParseHidden] = useState(false);
  const [showPreview, setShowPreview] = useState(() => { try { return localStorage.getItem("lgx.preview") !== "0"; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem("lgx.preview", showPreview ? "1" : "0"); } catch { /* yoksay */ } }, [showPreview]);

  const state = sh.doc?.state;
  const lh = sh.meta?.lhId ? app.getLetterhead(sh.meta.lhId) : null;
  const T = useMemo(() => (state ? computeTotals(state) : null), [state]);
  const company = sh.meta?.companyId ? app.getCompany(sh.meta.companyId) : null;

  // Para birimi (ya da şirket) değişince, "otomatik" modda banka hesabı para birimine uyana döner.
  // Sevkiyat açılırken çalışmaz: elle düzenlenmiş banka bilgisi ezilmesin.
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

  const ctx = useMemo(() => {
    if (!state) return null;
    const ph = (v, d) => (v ? fmtUi(v, d) : "");
    return {
      state, auto: sh.doc.auto, update: sh.update, lh, T, itemView, setItemView,
      placeholders: {
        "charges.vat": ph(T.vatCalc, 2),
        "packing.totalPackages": ph(T.itemPkgs, 0),
        "packing.totalNet": ph(T.itemNet, 2),
        "packing.totalGross": ph(T.itemGross, 2),
        "packing.totalVolume": ph(T.itemVol, 3)
      }
    };
  }, [state, sh.doc?.auto, sh.update, lh, T, itemView]);

  if (sh.status === "loading") return <div className="page page--center"><Spinner /></div>;
  if (sh.status === "missing") {
    return (
      <div className="page page--center">
        <div className="empty-state empty-state--sm"><p>{t("d.editor.missing")}</p><a className="btn btn--primary" href="#/shipments">{t("d.nav.shipments")}</a></div>
      </div>
    );
  }

  const isDoc = ALL_DOCS.includes(step);
  const active = isDoc || STEP_KEYS.includes(step) ? step : "general";
  const previewDoc = isDoc ? step : "ci";
  const letters = isDoc ? DOC_SECTIONS[step] : STEPS[active];
  const title = state.meta.invoiceNo.trim() || state.meta.proformaNo.trim() || t("d.untitled");
  const goStep = (k) => go(`/s/${id}/${k}`);

  const onDownload = async (kind) => {
    setBusyKey(kind);
    try {
      const { blob, name } = await buildDownload(kind, state, lh);
      saveBlob(blob, name);
      toast(t("dl.ok", { file: name }));
      // Antete satıcı, banka ve imza bilgisini hatırlat
      if (lh && !company) {
        app.saveLetterhead({
          ...lh,
          profile: {
            seller: { ...state.seller }, bank: { ...state.bank },
            sign: { name: state.sign.name, title: state.sign.title, place: state.sign.place, declaration: state.sign.declaration, showDeclaration: state.sign.showDeclaration }
          }
        });
      }
    } catch (e) {
      console.error(e);
      toast(t("dl.fail", { msg: e.message || String(e) }), "error", 8000);
    } finally {
      setBusyKey(null);
    }
  };

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

  const saveLabel = sh.saving === "saved" ? t("d.saved") : t("d.saving");

  const onStatus = async (value) => {
    if (value === sh.meta.status) return;
    // Kontrollü seçici: onaylanmazsa değer eski haline döner
    const ok = await askConfirm({ title: t("d.editor.confirmStatusTitle"), message: t("d.editor.confirmStatus", { from: t(`d.status.${sh.meta.status}`), to: t(`d.status.${value}`) }), confirmLabel: t("d.editor.confirmStatusOk") });
    if (ok) sh.updateMeta({ status: value });
  };

  return (
    <div className="editor">
      <header className="ed-head">
        <a className="btn btn--quiet btn--sm" href="#/shipments"><Icon name="back" />{t("d.nav.shipments")}</a>
        <div className="ed-title">
          <h1 title={title}>{title}</h1>
          {state.buyer.name && <span className="muted">{state.buyer.name}</span>}
          <label className="ed-select">
            <span className="visually-hidden">{t("d.col.status")}</span>
            <select className="select" value={sh.meta.status} onChange={(e) => onStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{t(`d.status.${s}`)}</option>)}
            </select>
          </label>
        </div>
        <span className={`save-state save-state--${sh.saving}`}><i />{saveLabel}</span>
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
            <select className="select" value={sh.meta.bankAuto ? "auto" : sh.meta.bankId || "auto"} onChange={(e) => onBank(e.target.value)} title={t("co.bank")}>
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
          <p className="ed-group">{t("d.grp.info")}</p>
          {STEP_KEYS.map((k) => (
            <button key={k} type="button" className={`ed-step${active === k ? " is-active" : ""}`} onClick={() => goStep(k)}>
              <Dot s={stepStatus(state, k)} /><span>{t(`d.step.${k}`)}</span>
            </button>
          ))}
          {DOC_GROUPS.map((g) => (
            <div key={g.key}>
              <p className="ed-group">{t(g.titleKey)}</p>
              {g.docs.map((d) => (
                <button key={d} type="button" className={`ed-step${active === d ? " is-active" : ""}`} onClick={() => goStep(d)} title={t(`d.ds.${docStatus(state, d)}`)}>
                  <Dot s={docStatus(state, d)} /><span lang="en">{t(`pv.${d}`)}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="ed-form ws-form">
          {active === "general" && sh.meta.parse && !parseHidden && <ParseReport parse={sh.meta.parse} onDismiss={() => setParseHidden(true)} />}
          {isDoc && (USES[step] || ["general", "items"]).length > 0 && (
            <div className="doc-links">
              <span>{t("d.editor.uses")}</span>
              {(USES[step] || ["general", "items"]).map((k) => <button key={k} type="button" className="btn btn--ghost btn--sm" onClick={() => goStep(k)}>{t(`d.step.${k}`)}<Icon name="chevron" /></button>)}
            </div>
          )}
          {letters.map((l) => <FormSection key={`${active}-${l}`} letter={l} ctx={ctx} only={isDoc ? DOC_ONLY[step]?.[l] : undefined} titleKey={isDoc ? DOC_TITLE[step]?.[l] : undefined} />)}
        </div>

        {showPreview && (
          <aside className="ed-preview" aria-label={t("pv.docLabel")}>
            <Preview state={state} lh={lh} doc={previewDoc} onDownload={onDownload} busyKey={busyKey} />
          </aside>
        )}
      </div>
    </div>
  );
}
