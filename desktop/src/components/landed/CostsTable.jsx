import { useT } from "../../lib/i18n.js";
import { Icon } from "../Icons.jsx";
import { Field } from "./Field.jsx";
import { ALLOC_KEYS, CURRENCIES } from "../../landed/rules.mjs";

/** Masraf satırları (navlun, sigorta, Türkiye içi nakliye, yurt içi masraf). */
export function CostsTable({ rows, errors, onChange, onDel }) {
  const t = useT();
  if (!rows.length) return null;
  return (
    <div className="pl-scroll">
      <div className="lc-cgrid lc-cgrid--head" aria-hidden="true">
        <span>{t("d.lc.col.kind")}</span><span>{t("d.lc.col.label")}</span><span>{t("d.lc.col.amount")}</span><span>{t("d.lc.col.cur")}</span>
        <span>{t("d.lc.col.included")}</span><span>{t("d.lc.col.alloc")}</span><span>{t("d.lc.col.costVat")}</span><span />
      </div>
      {rows.map((r) => {
        const canInclude = r.kind === "freight" || r.kind === "insurance";
        return (
          <div className="pl-row" key={r.id}>
            <div className="lc-cgrid">
              <span className="lc-kind">{t(`d.lc.kind.${r.kind}`)}</span>
              <Field row={r} field="label" numeric={false} errors={errors} onChange={onChange} label={t("d.lc.col.label")} />
              <Field row={r} field="amount" errors={errors} onChange={onChange} label={t("d.lc.col.amount")} />
              <select className="select" value={r.currency} onChange={(e) => onChange(r.id, { currency: e.target.value })} aria-label={t("d.lc.col.cur")}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <label className="check">
                <input type="checkbox" checked={canInclude && r.included} disabled={!canInclude} onChange={(e) => onChange(r.id, { included: e.target.checked })} aria-label={t("d.lc.col.included")} />
              </label>
              <select className="select" value={r.alloc} onChange={(e) => onChange(r.id, { alloc: e.target.value })} aria-label={t("d.lc.col.alloc")}>
                {ALLOC_KEYS.map((k) => <option key={k} value={k}>{t(`d.lc.alloc.${k}`)}</option>)}
              </select>
              {r.kind === "local"
                ? <Field row={r} field="vatRate" errors={errors} onChange={onChange} label={t("d.lc.col.costVat")} />
                : <span />}
              <span className="pl-act">
                <button type="button" className="icon-btn icon-btn--plain icon-btn--danger" title={t("d.lc.delRow")} aria-label={t("d.lc.delRow")} onClick={() => onDel(r.id)}><Icon name="trash" /></button>
              </span>
            </div>
            {errors[r.id] && <p className="pl-err">{[...new Set(Object.values(errors[r.id]))].map((k) => t(k)).join(" ")}</p>}
          </div>
        );
      })}
    </div>
  );
}
