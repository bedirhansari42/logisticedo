import { useT } from "../../lib/i18n.js";
import { Icon } from "../Icons.jsx";
import { Field } from "./Field.jsx";

const NUM_COLS = [
  ["qty", "d.lc.col.qty"], ["unitPrice", "d.lc.col.price"], ["weightKg", "d.lc.col.weight"], ["volumeM3", "d.lc.col.volume"],
  ["dutyRate", "d.lc.col.duty"], ["emyRate", "d.lc.col.emy"], ["kkdfRate", "d.lc.col.kkdf"], ["otherRate", "d.lc.col.other"],
  ["otherAmount", "d.lc.col.otherAmount"], ["otvRate", "d.lc.col.otv"], ["vatRate", "d.lc.col.vat"]
];

/** Kalem satırları. errors: { satırId: { alan: çeviriAnahtarı } } */
export function ItemsTable({ rows, errors, onChange, onDup, onDel }) {
  const t = useT();
  return (
    <div className="pl-scroll">
      <div className="lc-grid lc-grid--head" aria-hidden="true">
        <span>{t("d.lc.col.name")}</span><span>{t("d.lc.col.hs")}</span>
        {NUM_COLS.map(([, label]) => <span key={label}>{t(label)}</span>)}
        <span />
      </div>
      {rows.map((r) => (
        <div className="pl-row" key={r.id}>
          <div className="lc-grid">
            <Field row={r} field="name" numeric={false} errors={errors} onChange={onChange} label={t("d.lc.col.name")} />
            <Field row={r} field="hsCode" numeric={false} errors={errors} onChange={onChange} label={t("d.lc.col.hs")} />
            {NUM_COLS.map(([f, label]) => <Field key={f} row={r} field={f} errors={errors} onChange={onChange} label={t(label)} />)}
            <span className="pl-act">
              <button type="button" className="icon-btn icon-btn--plain" title={t("d.lc.dupRow")} aria-label={t("d.lc.dupRow")} onClick={() => onDup(r.id)}><Icon name="copy" /></button>
              <button type="button" className="icon-btn icon-btn--plain icon-btn--danger" title={t("d.lc.delRow")} aria-label={t("d.lc.delRow")} onClick={() => onDel(r.id)}><Icon name="trash" /></button>
            </span>
          </div>
          {errors[r.id] && <p className="pl-err">{[...new Set(Object.values(errors[r.id]))].map((k) => t(k)).join(" ")}</p>}
        </div>
      ))}
    </div>
  );
}
