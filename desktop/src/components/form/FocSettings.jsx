import { useT } from "../../lib/i18n.js";
import { FOC_REASONS } from "../../foc/model.mjs";
import { setField } from "./Field.jsx";

/** Ücretsiz (Free of Charge) sevkiyat: kutu, gönderim nedeni ve not. Kutu kapalıyken yalnızca kutu görünür. */
export function FocSettings({ ctx }) {
  const t = useT();
  const foc = ctx.state.foc;
  return (
    <section className="fcard" id="sec-foc">
      <header className="fcard-head"><h3>{t("d.foc.title")}</h3></header>
      <div className="fsec-body">
        <label className="check">
          <input type="checkbox" checked={!!foc.enabled} onChange={(e) => setField(ctx, "foc.enabled", e.target.checked)} />
          <span>{t("d.foc.enable")}</span>
        </label>
        <p className="muted">{t("d.foc.hint")}</p>
        {foc.enabled && (
          <>
            <div className="fgrid fgrid--2">
              <div className="field">
                <label htmlFor="f_foc_reason">{t("d.foc.reason")}</label>
                <select id="f_foc_reason" className="select" value={foc.reason} onChange={(e) => setField(ctx, "foc.reason", e.target.value)}>
                  {FOC_REASONS.map((k) => <option key={k} value={k}>{t(`d.foc.reason.${k}`)}</option>)}
                </select>
              </div>
              {foc.reason === "OTHER" && (
                <div className="field">
                  <label htmlFor="f_foc_reasonOther">{t("d.foc.reasonOther")}</label>
                  <input id="f_foc_reasonOther" className="input" value={foc.reasonOther} onChange={(e) => setField(ctx, "foc.reasonOther", e.target.value)} />
                </div>
              )}
            </div>
            <div className="field">
              <label htmlFor="f_foc_note">{t("d.foc.note")}</label>
              <textarea id="f_foc_note" className="textarea" rows={3} value={foc.note} onChange={(e) => setField(ctx, "foc.note", e.target.value)} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
