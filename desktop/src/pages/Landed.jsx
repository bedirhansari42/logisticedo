import { useEffect, useMemo, useState } from "react";
import { toast } from "@common";
import { parseProforma } from "@engine/parse/index.js";
import { uiDec } from "@engine/doc-model.js";
import { useT } from "../lib/i18n.js";
import { Icon, Spinner } from "../components/Icons.jsx";
import { Dropzone } from "../components/Dropzone.jsx";
import { ParseReport, buildParseSummary } from "../components/ParseReport.jsx";
import { saveBlob } from "../lib/download.js";
import { ItemsTable } from "../components/landed/ItemsTable.jsx";
import { CostsTable } from "../components/landed/CostsTable.jsx";
import { ResultView } from "../components/landed/ResultView.jsx";
import { Field } from "../components/landed/Field.jsx";
import { INCOTERMS, CURRENCIES, defaultIncluded } from "../landed/rules.mjs";
import { loadDraft, saveDraft, parseDraft, newItemRow, newCostRow, currenciesNeeded } from "../landed/model.mjs";
import { calcLanded } from "../landed/calc.mjs";
import { applyParseToDraft } from "../landed/proforma.mjs";

const COST_KINDS = ["freight", "insurance", "deduct", "local"];

export function Landed() {
  const t = useT();
  const decimal = uiDec(); // dil değişince useT yeniden çizdirir
  const [draft, setDraft] = useState(loadDraft);
  useEffect(() => { saveDraft(draft); }, [draft]);

  const patch = (p) => setDraft((d) => ({ ...d, ...p }));
  const setItem = (id, p) => setDraft((d) => ({ ...d, items: d.items.map((r) => (r.id === id ? { ...r, ...p } : r)) }));
  const addItem = () => setDraft((d) => ({ ...d, items: [...d.items, newItemRow(d.defaultVatRate)] }));
  const dupItem = (id) => setDraft((d) => {
    const i = d.items.findIndex((r) => r.id === id);
    const copy = { ...d.items[i], id: newItemRow().id };
    return { ...d, items: [...d.items.slice(0, i + 1), copy, ...d.items.slice(i + 1)] };
  });
  const delItem = (id) => setDraft((d) => ({ ...d, items: d.items.length > 1 ? d.items.filter((r) => r.id !== id) : [newItemRow(d.defaultVatRate)] }));
  const clearItems = () => setDraft((d) => ({ ...d, items: [newItemRow(d.defaultVatRate)] }));
  const setCost = (id, p) => setDraft((d) => ({ ...d, costs: d.costs.map((r) => (r.id === id ? { ...r, ...p } : r)) }));
  const addCost = (kind) => setDraft((d) => ({ ...d, costs: [...d.costs, newCostRow(kind, d)] }));
  const delCost = (id) => setDraft((d) => ({ ...d, costs: d.costs.filter((r) => r.id !== id) }));
  const setRate = (cur, value) => setDraft((d) => ({ ...d, rates: { ...d.rates, [cur]: value } }));
  const onIncoterm = (incoterm) => setDraft((d) => ({
    ...d, incoterm,
    costs: d.costs.map((c) => (c.kind === "freight" || c.kind === "insurance" ? { ...c, included: defaultIncluded(incoterm, c.kind) } : c))
  }));

  const [imp, setImp] = useState(null); // { reading } | { error, name } | { parse, warnings }
  const [busy, setBusy] = useState(false);
  const [dl, setDl] = useState(null); // "pdf" | "xlsx"

  const hasData = draft.items.some((r) => r.name || r.qty || r.unitPrice);
  const onFile = async (file) => {
    if (hasData && !window.confirm(t("d.lc.confirmReplace"))) return;
    setBusy(true);
    setImp({ reading: file.name });
    try {
      const res = await parseProforma(file);
      const { draft: next, warnings } = applyParseToDraft(draft, res, { decimal });
      setDraft(next);
      setImp({ parse: buildParseSummary(file.name, res), warnings });
    } catch (e) {
      console.error(e);
      setImp({ error: e.key ? t(e.key, e.vars) : t("warn.failed", { msg: e.message || String(e) }), name: file.name });
    } finally {
      setBusy(false);
    }
  };

  const parsed = useMemo(() => parseDraft(draft, { decimal }), [draft, decimal]);
  const result = useMemo(() => (parsed.ok ? calcLanded(parsed.input) : null), [parsed]);
  const errs = useMemo(() => {
    const m = { item: {}, cost: {}, rate: {} };
    if (!parsed.ok) for (const e of parsed.errors) ((m[e.scope][e.id] ||= {})[e.field] = e.key);
    return m;
  }, [parsed]);

  const download = async (kind) => {
    if (dl || !result?.ok) return;
    setDl(kind);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      if (kind === "pdf") {
        const { buildLandedPdf } = await import("../landed/pdf.mjs");
        saveBlob(new Blob([await buildLandedPdf(parsed.input, result)], { type: "application/pdf" }), `Landed-Cost_${stamp}.pdf`);
      } else {
        const { buildLandedXlsx } = await import("../landed/xlsx.mjs");
        saveBlob(new Blob([await buildLandedXlsx(parsed.input, result)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `Landed-Cost_${stamp}.xlsx`);
      }
    } catch (e) {
      console.error(e);
      toast(t("d.lc.dlFail", { msg: e?.message || String(e) }), "error", 8000);
    } finally {
      setDl(null);
    }
  };

  const need = currenciesNeeded(draft);
  const term = INCOTERMS[draft.incoterm];
  const calcErrors = result && !result.ok ? result.errors : [];
  const onlyEmpty = calcErrors.length === 1 && calcErrors[0].key === "d.lc.err.noItems";
  const errText = (e) => t(e.key, e.key === "d.lc.err.keyMissing" ? { ...e.vars, key: t(`d.lc.alloc.${e.vars.key}`) } : e.vars);

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>{t("d.lc.title")}</h1><p className="muted">{t("d.lc.subtitle")}</p></div>
      </header>

      <section className="card-block pad">
        <h2 className="block-title">{t("d.lc.import")}</h2>
        <p className="muted">{t("d.lc.importDesc")}</p>
        <Dropzone onFile={onFile} busy={busy} compact accept=".pdf,.xlsx,.xlsm,.xls,.csv,.ods,.docx,application/pdf" title={t("pf.drop")} sub={t("pf.formats")} />
        {imp?.reading && <p className="pr-file muted">{t("pf.reading", { file: imp.reading })}</p>}
        {imp?.error && <ul className="pr-warnings parse-result"><li className="lvl-error"><Icon name="error" /><span><strong>{imp.name}</strong> — {imp.error}</span></li></ul>}
        {imp?.parse && <ParseReport parse={imp.parse} onDismiss={() => setImp(null)} />}
        {imp?.warnings?.map((w, i) => <p key={i} className="warn-text pl-hint">{t(w.key, w.vars)}</p>)}
      </section>

      <section className="card-block pad">
        <h2 className="block-title">{t("d.lc.settings")}</h2>
        <div className="lc-settings">
          <label className="lc-set"><span>{t("d.lc.currency")}</span>
            <select className="select" value={draft.currency} onChange={(e) => patch({ currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </label>
          <label className="lc-set"><span>{t("d.lc.incoterm")}</span>
            <select className="select" value={draft.incoterm} onChange={(e) => onIncoterm(e.target.value)}>{Object.keys(INCOTERMS).map((k) => <option key={k} value={k}>{k}</option>)}</select>
          </label>
          <label className="lc-set"><span>{t("d.lc.defaultVat")}</span>
            <input className="input" inputMode="decimal" value={draft.defaultVatRate} onChange={(e) => patch({ defaultVatRate: e.target.value })} />
          </label>
        </div>
        {need.length > 0 && (
          <div>
            <p className="muted pl-hint">{t("d.lc.rates")}</p>
            <div className="lc-rates">
              {need.map((c) => (
                <label key={c} className="lc-rate"><span>1 {c} =</span>
                  <Field row={{ id: c, rate: draft.rates[c] ?? "" }} field="rate" errors={errs.rate} onChange={(id, p) => setRate(id, p.rate)} label={`${c} → TRY`} placeholder={t("d.lc.ratePh")} />
                  <span>TRY</span>
                </label>
              ))}
            </div>
            {Object.keys(errs.rate).length > 0 && <p className="pl-err">{[...new Set(Object.values(errs.rate).flatMap((f) => Object.values(f)))].map((k) => t(k)).join(" ")}</p>}
          </div>
        )}
        <div className="lc-checks">
          <label className="check"><input type="checkbox" checked={draft.vatDeductible} onChange={(e) => patch({ vatDeductible: e.target.checked })} />{t("d.lc.vatDeductible")}</label>
          <label className="check"><input type="checkbox" checked={draft.kkdfInVat} onChange={(e) => patch({ kkdfInVat: e.target.checked })} />{t("d.lc.kkdfInVat")}</label>
          <label className="check"><input type="checkbox" checked={draft.flatInsurance} onChange={(e) => patch({ flatInsurance: e.target.checked })} />{t("d.lc.flatInsurance")}</label>
        </div>
        {term?.delivered && <p className="muted pl-hint">{t("d.lc.dNote")}</p>}
        {term?.dutyPaid && <p className="warn-text pl-hint">{t("d.lc.ddpNote")}</p>}
      </section>

      <section className="card-block pad">
        <div className="block-head pl-head">
          <h2 className="block-title">{t("d.lc.items")}</h2>
          <button type="button" className="btn btn--quiet btn--sm" onClick={clearItems}>{t("d.lc.clear")}</button>
        </div>
        <p className="muted pl-hint">{t("d.lc.itemsHint")}</p>
        <ItemsTable rows={draft.items} errors={errs.item} onChange={setItem} onDup={dupItem} onDel={delItem} />
        <div className="pl-actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={addItem}><Icon name="plus" />{t("d.lc.addRow")}</button>
        </div>
      </section>

      <section className="card-block pad">
        <h2 className="block-title">{t("d.lc.costs")}</h2>
        <p className="muted pl-hint">{t("d.lc.costsHint")}</p>
        <CostsTable rows={draft.costs} errors={errs.cost} onChange={setCost} onDel={delCost} />
        <div className="lc-addcosts">
          {COST_KINDS.map((k) => <button key={k} type="button" className="btn btn--ghost btn--sm" onClick={() => addCost(k)}><Icon name="plus" />{t(`d.lc.kind.${k}`)}</button>)}
        </div>
      </section>

      <section className="card-block pad">
        <h2 className="block-title">{t("d.lc.result")}</h2>
        <p className="muted pl-hint">{t("d.lc.estimate")}</p>
        {!parsed.ok && <p className="warn-text">{t("d.lc.fix")}</p>}
        {onlyEmpty && <p className="muted">{t("d.lc.empty")}</p>}
        {!onlyEmpty && calcErrors.length > 0 && <ul className="pl-list">{calcErrors.map((e, i) => <li key={i} className="warn-text">{errText(e)}</li>)}</ul>}
        {result?.ok && <ResultView result={result} input={parsed.input} />}
        {result?.ok && (
          <div className="lc-downloads">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => download("pdf")} disabled={!!dl}>{dl === "pdf" ? <><Spinner />{t("d.lc.busy")}</> : <><Icon name="download" />{t("d.lc.pdf")}</>}</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => download("xlsx")} disabled={!!dl}>{dl === "xlsx" ? <><Spinner />{t("d.lc.busy")}</> : <><Icon name="download" />{t("d.lc.xlsx")}</>}</button>
          </div>
        )}
      </section>
    </div>
  );
}
