import { useEffect, useRef, useState } from "react";
import { toast, ICONS } from "@common";
import { useT } from "../../lib/i18n.js";
import { normUnit } from "@engine/parse/normalize.js";
import { newItem, toInput, uiDec, lineAmount, isAmountComputed, fmtUi, distribute } from "@engine/doc-model.js";
import { AutoArea, NUM_FILTER } from "./Field.jsx";
import { ItemTotals } from "./Totals.jsx";
import { Icon } from "../Icons.jsx";
import { ListInput } from "./ListInput.jsx";

const NUMERIC = new Set(["qty", "unitPrice", "vatRate", "amount", "packages", "netWeight", "grossWeight", "volume"]);

const COLS = {
  invoice: [
    ["code", "it.code", "text", "w-code"],
    ["description", "it.desc", "area", "w-desc"],
    ["hsCode", "it.hs", "text", "w-hs"],
    ["origin", "it.origin", "text", "w-origin", "dl-country"],
    ["qty", "it.qty", "num", "w-num"],
    ["unit", "it.unit", "text", "w-unit", "dl-unit"],
    ["unitPrice", "it.price", "num", "w-num"],
    ["currency", "it.cur", "text", "w-cur", "dl-currency"],
    ["vatRate", "it.vatRate", "num", "w-vat"],
    ["amount", "it.amount", "amount", "w-amt"]
  ],
  packing: [
    ["description", "it.desc", "area", "w-desc"],
    ["packages", "it.pkgs", "num", "w-num"],
    ["packageType", "it.pkgType", "text", "w-ptype", "dl-pkg"],
    ["netWeight", "it.net", "num", "w-num"],
    ["grossWeight", "it.gross", "num", "w-num"],
    ["dimensions", "it.dims", "text", "w-dims"],
    ["volume", "it.vol", "num", "w-num"]
  ]
};

/** invoiceOnly (proforma): tek belge para birimi var, kalem başına para birimi sütunu yok */
function visibleCols(state, view, invoiceOnly, focMode) {
  const showCode = state.items.some((it) => it.code);
  return COLS[view].filter(([f]) => (f !== "code" || showCode) && !((invoiceOnly || focMode) && f === "currency") && !(focMode && f === "vatRate"));
}

/** Ücretsiz sevkiyatta fiyat ve tutar sütunları gümrük değeri olarak adlandırılır */
const colKey = (f, key, focMode) => (focMode && f === "unitPrice" ? "d.foc.colPrice" : focMode && f === "amount" ? "d.foc.colAmount" : key);

export function ItemsTable({ ctx }) {
  const t = useT();
  const { state, auto, update, itemView: view, setItemView } = ctx;
  const cols = visibleCols(state, view, ctx.invoiceOnly, ctx.focMode);
  const focusLast = useRef(false);
  const cur = (state.meta.currency || "").trim().toUpperCase();

  useEffect(() => {
    if (!focusLast.current) return;
    focusLast.current = false;
    const rows = document.querySelectorAll("#itemsTable tbody tr[data-id]");
    rows[rows.length - 1]?.querySelector("textarea, input")?.focus();
  });

  const onItem = (id, f, raw) => update((d, a) => {
    const it = d.items.find((x) => x.id === id);
    if (!it) return;
    let v = raw;
    if (NUMERIC.has(f)) v = v.replace(NUM_FILTER, "");
    if (f === "currency") v = v.toUpperCase();
    it[f] = v;
    a.delete(`item:${id}:${f}`);
    if ((f === "qty" || f === "unitPrice") && isAmountComputed(it)) it.amount = toInput(lineAmount(it), uiDec(), 2);
  });

  const add = () => { focusLast.current = true; update((d) => { const last = d.items[d.items.length - 1]; d.items.push(newItem({ unit: last?.unit || "PCS" })); }); };
  const remove = (id) => update((d) => { d.items = d.items.filter((x) => x.id !== id); });
  const dup = (id) => update((d) => { const i = d.items.findIndex((x) => x.id === id); if (i < 0) return; const { id: _drop, ...copy } = d.items[i]; d.items.splice(i + 1, 0, newItem(copy)); });

  const onPaste = (e, id, field) => {
    const text = e.clipboardData?.getData("text/plain") || "";
    if (!text.includes("\t") && !/\n.*\S/.test(text.trim())) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
    const pasteCols = cols.filter(([, , type]) => type !== "amount").map(([f]) => f);
    // Tam satır kopyalandıysa ilk sütundan başla; yoksa hücreden sağa doğru
    const width = Math.max(...lines.map((l) => l.split("\t").length));
    const start = width >= pasteCols.length ? 0 : Math.max(0, pasteCols.indexOf(field));
    update((d) => {
      const idx = d.items.findIndex((x) => x.id === id);
      lines.forEach((line, k) => {
        let it = d.items[idx + k];
        if (!it) { it = newItem({ unit: d.items[idx]?.unit || "PCS" }); d.items.push(it); }
        line.split("\t").forEach((cell, j) => {
          const f = pasteCols[start + j];
          if (!f) return;
          const v = cell.trim();
          it[f] = f === "unit" ? normUnit(v) || v.toUpperCase()
            : f === "packageType" || f === "currency" ? v.toUpperCase()
            : f === "vatRate" ? v.replace(/[%\s]/g, "")
            : NUMERIC.has(f) ? v.replace(/[^\d.,\-]/g, "") : v;
        });
      });
    });
    toast(t("it.pasted", { n: lines.length }));
  };

  return (
    <>
      <div className="items-bar">
        {ctx.invoiceOnly ? <span /> : (
          <div className="segmented" role="group">
            <button type="button" aria-pressed={view === "invoice"} onClick={() => setItemView("invoice")}>{t("it.viewInvoice")}</button>
            <button type="button" aria-pressed={view === "packing"} onClick={() => setItemView("packing")}>{t("it.viewPacking")}</button>
          </div>
        )}
        <button className="btn btn--ghost btn--sm" type="button" onClick={add}><Icon name="plus" /><span>{t("it.add")}</span></button>
      </div>
      <div className="items-wrap">
        <table className="items" id="itemsTable">
          <thead>
            <tr>
              <th className="it-no">{t("it.no")}</th>
              {cols.map(([f, key, , cls]) => <th key={f} className={cls}>{t(colKey(f, key, ctx.focMode))}</th>)}
              <th className="it-act" />
            </tr>
          </thead>
          <tbody>
            {!state.items.length && <tr className="it-empty"><td colSpan={cols.length + 2}>{t("it.empty")}</td></tr>}
            {state.items.map((it, i) => (
              <tr key={it.id} data-id={it.id}>
                <td className="it-no">{i + 1}</td>
                {cols.map(([field, key, type, cls, list]) => {
                  const isAuto = auto.has(`item:${it.id}:${field}`);
                  const aria = `${t(colKey(field, key, ctx.focMode))} ${i + 1}`;
                  const common = { "aria-label": aria, onPaste: (e) => onPaste(e, it.id, field) };
                  let cell;
                  if (type === "area") {
                    cell = <AutoArea value={it[field] ?? ""} className={isAuto ? "is-auto" : ""} onChange={(e) => onItem(it.id, field, e.target.value)} {...common} />;
                  } else if (type === "amount" && isAmountComputed(it)) {
                    cell = <input className="num" readOnly tabIndex={-1} value={fmtUi(lineAmount(it))} aria-label={aria} />;
                  } else {
                    const numeric = type === "num" || type === "amount";
                    const placeholder = ctx.required?.[field]?.has(it.id) ? t("d.req.cellPh") : field === "currency" ? cur : field === "origin" ? state.shipment.countryOrigin : field === "vatRate" ? state.charges.vatRate || "0" : field === "packageType" ? state.packing.packageType : undefined;
                    cell = (
                      <ListInput
                        type="text" value={it[field] ?? ""} list={list} inputMode={numeric ? "decimal" : undefined} placeholder={placeholder}
                        className={`${numeric ? "num" : ""}${field === "currency" ? " cur" : ""}${isAuto ? " is-auto" : ""}`.trim()}
                        onChange={(e) => onItem(it.id, field, e.target.value)} {...common}
                      />
                    );
                  }
                  const req = ctx.required?.[field]?.has(it.id);
                  return <td key={field} className={`${cls}${req ? " is-required" : ""}`} data-field={field} title={req ? t("d.req.cell") : undefined}>{cell}</td>;
                })}
                <td className="it-act">
                  <button type="button" className="icon-btn icon-btn--plain" title={t("it.dup")} aria-label={t("it.dup")} onClick={() => dup(it.id)} dangerouslySetInnerHTML={{ __html: ICONS.copy }} />
                  <button type="button" className="icon-btn icon-btn--plain icon-btn--danger" title={t("it.remove")} aria-label={t("it.remove")} onClick={() => remove(it.id)} dangerouslySetInnerHTML={{ __html: ICONS.trash }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="items-foot">
        <p className="muted items-hint">{t("it.pasteHint")}</p>
        {ctx.T.mixedCurrency && <p className="muted items-hint is-warn">{t("it.mixedCur")}</p>}
        <ItemTotals ctx={ctx} />
      </div>
    </>
  );
}

/** Toplam kap/ağırlık/hacmi kalemlere dağıtma bloğu (Paketleme bölümü) */
export function DistBlock({ ctx }) {
  const t = useT();
  const [basis, setBasis] = useState("qty");
  const apply = () => {
    const probe = structuredClone(ctx.state);
    const n = distribute(probe, basis);
    if (n === -1) { toast(t("dist.nothing"), "warn"); return; }
    if (!n) { toast(t("it.empty"), "warn"); return; }
    ctx.update((d, a) => {
      distribute(d, basis);
      for (const it of d.items) ["packages", "netWeight", "grossWeight", "volume", "packageType"].forEach((f) => a.delete(`item:${it.id}:${f}`));
    });
    ctx.setItemView("packing");
    toast(t("dist.done", { n }));
  };
  return (
    <div className="dist">
      <div>
        <strong>{t("dist.title")}</strong>
        <p className="muted">{t("dist.desc")}</p>
      </div>
      <div className="dist-actions">
        <select className="select" aria-label="basis" value={basis} onChange={(e) => setBasis(e.target.value)}>
          <option value="qty">{t("dist.byQty")}</option>
          <option value="amount">{t("dist.byAmount")}</option>
        </select>
        <button className="btn btn--ghost btn--sm" type="button" onClick={apply}>{t("dist.apply")}</button>
      </div>
    </div>
  );
}
