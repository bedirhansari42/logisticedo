import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@common";
import { saveBlob } from "../lib/download.js";
import { useT } from "../lib/i18n.js";
import { Icon, Spinner } from "../components/Icons.jsx";
import { CONTAINERS, CONTAINER_KEYS } from "../planner/containers.mjs";
import { newRow, parseItemRow, parseGap, loadDraft, saveDraft } from "../planner/items.mjs";
import { planAll } from "../planner/pack.mjs";
import { TopView, LayerView, IsoView, makeColorOf, LABEL_LIMIT } from "../components/planner/PlanViews.jsx";

const isBlank = (r) => !r.name && !r.l && !r.w && !r.h && !r.qty && !r.weight && !r.palletized && !r.upright;

/** Hesabı Web Worker'da yapar; worker açılamazsa ana iş parçacığında çalıştırır. */
function useCalculator() {
  const worker = useRef(null);
  useEffect(() => () => worker.current?.terminate(), []);
  return (items, gap) => new Promise((resolve) => {
    const fallback = () => {
      try { resolve({ results: planAll(items, { gap }) }); } catch (e) { resolve({ error: e?.message || String(e) }); }
    };
    try {
      worker.current?.terminate();
      const w = new Worker(new URL("../planner/worker.mjs", import.meta.url), { type: "module" });
      worker.current = w;
      w.onmessage = (e) => resolve(e.data);
      w.onerror = (e) => { e.preventDefault?.(); w.terminate(); fallback(); };
      w.postMessage({ items, gap });
    } catch { fallback(); }
  });
}

function summarize(result, key) {
  const C = CONTAINERS[key];
  const placed = result.containers.reduce((s, c) => s + c.placements.length, 0);
  const unplaced = result.unplaced.reduce((s, u) => s + u.count, 0);
  const used = result.containers.reduce((s, c) => s + c.usedVolumeCm3, 0);
  const pct = result.containers.length ? Math.round((used / (result.containers.length * C.L * C.W * C.H)) * 1000) / 10 : 0;
  const kg = Math.round(result.containers.reduce((s, c) => s + c.weightKg, 0) * 1000) / 1000;
  return { placed, unplaced, pct, kg };
}

export function Planner() {
  const t = useT();
  const calc = useCalculator();
  const [draft] = useState(loadDraft);
  const [rows, setRows] = useState(draft.rows);
  const [gap, setGap] = useState(String(draft.gap));
  const [container, setContainer] = useState(draft.container);
  const [errors, setErrors] = useState({}); // rowId → { field: key }
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState(null); // { results, items } | { none: true }
  const [stale, setStale] = useState(false);
  const [gapBad, setGapBad] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [tab, setTab] = useState("top");
  const [ctIdx, setCtIdx] = useState(0);

  useEffect(() => {
    const g = parseGap(gap);
    saveDraft({ rows, gap: g.ok ? g.value : 0, container });
  }, [rows, gap, container]);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    setStale(true); // liste ya da boşluk payı değişti: eldeki sonuç eskidi
  }, [rows, gap]);

  const setRow = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, newRow()]);
  const dupRow = (id) => setRows((rs) => { const i = rs.findIndex((r) => r.id === id); const c = { ...rs[i], id: newRow().id }; return [...rs.slice(0, i + 1), c, ...rs.slice(i + 1)]; });
  const delRow = (id) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : [newRow()]));
  const clearAll = () => { setRows([newRow()]); setErrors({}); setOut(null); };

  const run = async () => {
    const errs = {};
    const items = [];
    let fillSeen = false;
    for (const r of rows) {
      if (isBlank(r)) continue;
      const p = parseItemRow(r);
      if (!p.ok) { errs[r.id] = Object.fromEntries(p.errors.map((e) => [e.field, e.key])); continue; }
      if (p.item.qty === null) {
        if (fillSeen) { errs[r.id] = { qty: "d.pl.err.oneFill" }; continue; }
        fillSeen = true;
      }
      items.push(p.item);
    }
    setErrors(errs);
    const gp = parseGap(gap);
    setGapBad(!gp.ok);
    if (!gp.ok) errs.__gap = true;
    if (Object.keys(errs).length) { setOut(null); setStale(false); toast(t("d.pl.err.fix"), "warn"); return; }
    if (!items.length) { setOut({ none: true }); return; }
    setBusy(true);
    const res = await calc(items, gp.value);
    setBusy(false);
    if (res.error) { toast(res.error, "error", 8000); return; }
    setCtIdx(0);
    setStale(false);
    setOut({ results: res.results, items });
  };

  const downloadPdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const { buildPlanPdf } = await import("../planner/pdf.mjs");
      const bytes = await buildPlanPdf(out.results[container], out.items);
      saveBlob(new Blob([bytes], { type: "application/pdf" }), `Container-Load-Plan_${container}.pdf`);
    } catch (e) {
      console.error(e);
      toast(t("d.pl.pdfFail", { msg: e?.message || String(e) }), "error", 8000);
    } finally {
      setPdfBusy(false);
    }
  };

  const names = useMemo(() => Object.fromEntries((out?.items || []).map((i) => [i.id, i.name])), [out]);
  const reasons = { too_big: t("d.pl.reason.too_big"), no_space: t("d.pl.reason.no_space"), cap: t("d.pl.reason.cap") };
  const colorOf = useMemo(() => makeColorOf(out?.items || []), [out]);
  const sel = out?.results?.[container];
  const cur = sel?.containers[Math.min(ctIdx, (sel?.containers.length || 1) - 1)];
  const fieldErr = (r, f) => errors[r.id]?.[f];

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>{t("d.pl.title")}</h1><p className="muted">{t("d.pl.subtitle")}</p></div>
      </header>

      <section className="card-block pad">
        <div className="block-head pl-head">
          <h2 className="block-title">{t("d.pl.items")}</h2>
          <button type="button" className="btn btn--quiet btn--sm" onClick={clearAll}>{t("d.pl.clear")}</button>
        </div>
        <p className="muted pl-hint">{t("d.pl.qtyHint")} {t("d.pl.palletHint")}</p>
        <div className="pl-scroll">
          <div className="pl-grid pl-grid--head" aria-hidden="true">
            <span>{t("d.pl.col.name")}</span><span>{t("d.pl.col.l")}</span><span>{t("d.pl.col.w")}</span><span>{t("d.pl.col.h")}</span>
            <span>{t("d.pl.col.qty")}</span><span>{t("d.pl.col.weight")}</span><span>{t("d.pl.col.pallet")}</span><span>{t("d.pl.col.upright")}</span><span />
          </div>
          {rows.map((r) => (
            <div className="pl-row" key={r.id}>
              <div className="pl-grid">
                <input className="input" value={r.name} onChange={(e) => setRow(r.id, { name: e.target.value })} aria-label={t("d.pl.col.name")} />
                {["l", "w", "h"].map((f) => (
                  <input key={f} className={`input${fieldErr(r, f) ? " is-bad" : ""}`} inputMode="decimal" value={r[f]} onChange={(e) => setRow(r.id, { [f]: e.target.value })} aria-label={t(`d.pl.col.${f}`)} aria-invalid={!!fieldErr(r, f)} />
                ))}
                <input className={`input${fieldErr(r, "qty") ? " is-bad" : ""}`} inputMode="numeric" value={r.qty} placeholder="∞" onChange={(e) => setRow(r.id, { qty: e.target.value })} aria-label={t("d.pl.col.qty")} aria-invalid={!!fieldErr(r, "qty")} />
                <input className={`input${fieldErr(r, "weight") ? " is-bad" : ""}`} inputMode="decimal" value={r.weight} onChange={(e) => setRow(r.id, { weight: e.target.value })} aria-label={t("d.pl.col.weight")} aria-invalid={!!fieldErr(r, "weight")} />
                <label className="check"><input type="checkbox" checked={r.palletized} onChange={(e) => setRow(r.id, { palletized: e.target.checked })} aria-label={t("d.pl.col.pallet")} /></label>
                <label className="check"><input type="checkbox" checked={r.upright} disabled={r.palletized} onChange={(e) => setRow(r.id, { upright: e.target.checked })} aria-label={t("d.pl.col.upright")} /></label>
                <span className="pl-act">
                  <button type="button" className="icon-btn icon-btn--plain" title={t("d.pl.dupRow")} aria-label={t("d.pl.dupRow")} onClick={() => dupRow(r.id)}><Icon name="copy" /></button>
                  <button type="button" className="icon-btn icon-btn--plain icon-btn--danger" title={t("d.pl.delRow")} aria-label={t("d.pl.delRow")} onClick={() => delRow(r.id)}><Icon name="trash" /></button>
                </span>
              </div>
              {errors[r.id] && <p className="pl-err">{[...new Set(Object.values(errors[r.id]))].map((k) => t(k)).join(" ")}</p>}
            </div>
          ))}
        </div>
        <div className="pl-actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={addRow}><Icon name="plus" />{t("d.pl.addRow")}</button>
          <label className="pl-gap"><span>{t("d.pl.gap")}</span><input className={`input${gapBad ? " is-bad" : ""}`} inputMode="decimal" value={gap} aria-invalid={gapBad} onChange={(e) => { setGap(e.target.value); setGapBad(false); }} />{gapBad && <em className="pl-err">{t("d.pl.err.gap")}</em>}</label>
          <button type="button" className="btn btn--primary" onClick={run} disabled={busy}>{busy ? <><Spinner />{t("d.pl.planning")}</> : t("d.pl.plan")}</button>
        </div>
      </section>

      {!out && <p className="muted">{t("d.pl.empty")}</p>}
      {out?.none && <p className="muted">{t("d.pl.empty")}</p>}

      {out?.results && (
        <section className="card-block pad">
          <h2 className="block-title">{t("d.pl.result")}</h2>
          {stale && <p className="warn-text">{t("d.pl.stale")}</p>}
          <p className="muted pl-hint">{t("d.pl.estimate")}</p>
          <div className="pl-cards" role="radiogroup">
            {CONTAINER_KEYS.map((k) => {
              const r = out.results[k];
              const s = summarize(r, k);
              return (
                <button type="button" key={k} role="radio" aria-checked={container === k} className={`pl-card${container === k ? " is-on" : ""}`} onClick={() => { setContainer(k); setCtIdx(0); }}>
                  <strong>{CONTAINERS[k].label}</strong>
                  <span>{t("d.pl.card.containers", { n: r.containers.length })}</span>
                  <span>{t("d.pl.card.placed", { n: s.placed })}</span>
                  {s.unplaced > 0 && <span className="warn-text">{t("d.pl.card.unplaced", { n: s.unplaced })}</span>}
                  {r.fill && <span>{t("d.pl.card.fill", { n: r.fill.count })}</span>}
                  {r.fill?.reason && <span className="warn-text">{t(r.fill.reason === "too_big" ? "d.pl.fillNote.too_big" : "d.pl.fillNote.first_full")}</span>}
                  <span>{t("d.pl.card.fillPct", { p: s.pct })}</span>
                  {s.kg > 0 && <span>{t("d.pl.card.weight", { kg: s.kg })}</span>}
                </button>
              );
            })}
          </div>

          {cur && (
            <div className="pl-viewer">
              <div className="pl-viewbar">
                <div className="segmented" role="tablist">
                  {[["top", "d.pl.tab.top"], ["iso", "d.pl.tab.iso"], ["layers", "d.pl.tab.layers"]].map(([k, label]) => (
                    <button type="button" key={k} role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => setTab(k)}>{t(label)}</button>
                  ))}
                </div>
                <button type="button" className="btn btn--ghost btn--sm" onClick={downloadPdf} disabled={!sel.containers.length || stale || pdfBusy}>{pdfBusy ? <><Spinner />{t("d.pl.pdfBusy")}</> : <><Icon name="download" />{t("d.pl.pdf")}</>}</button>
                {sel.containers.length > 1 && (
                  <select className="select pl-ctsel" value={Math.min(ctIdx, sel.containers.length - 1)} onChange={(e) => setCtIdx(Number(e.target.value))} aria-label={t("d.pl.container", { i: "", n: "" })}>
                    {sel.containers.map((c, i) => <option key={c.index} value={i}>{t("d.pl.container", { i: i + 1, n: sel.containers.length })} · {t("d.pl.card.fillPct", { p: c.fillPct })}</option>)}
                  </select>
                )}
              </div>
              {tab === "top" && <TopView container={CONTAINERS[container]} placements={cur.placements} colorOf={colorOf} doorLabel={t("d.pl.door")} backLabel={t("d.pl.back")} />}
              {tab === "iso" && <IsoView container={CONTAINERS[container]} placements={cur.placements} colorOf={colorOf} doorLabel={t("d.pl.door")} />}
              {tab === "layers" && <LayerView container={CONTAINERS[container]} placements={cur.placements} colorOf={colorOf} layerLabel={(n, z) => t("d.pl.layer", { n, z })} />}
              <p className="muted pl-hint">{t("d.pl.seqHint")}{cur.placements.length > LABEL_LIMIT ? ` ${t("d.pl.simplified")}` : ""}</p>
              <ul className="pl-legend" aria-label={t("d.pl.legend")}>
                {out.items.filter((it) => cur.placements.some((p) => p.itemId === it.id)).map((it) => (
                  <li key={it.id}><i style={{ background: colorOf(it.id) }} />{it.name} × {cur.placements.filter((p) => p.itemId === it.id).length}</li>
                ))}
              </ul>
            </div>
          )}
          {out.results[container].capped && <p className="warn-text">{t("d.pl.capped")}</p>}
          {out.results[container].unplaced.some((u) => u.count > 0) && (
            <div>
              <h3 className="pl-sub">{t("d.pl.unplaced")}</h3>
              <ul className="pl-list">
                {out.results[container].unplaced.filter((u) => u.count > 0).map((u) => (
                  <li key={u.itemId + u.reason}>{names[u.itemId]} × {u.count} — {reasons[u.reason]}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
