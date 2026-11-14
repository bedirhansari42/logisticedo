import { useT } from "../../lib/i18n.js";
import { setField } from "./Field.jsx";

/** Proforma notları (PDF ve Excel çıktısında "Notes" kutusu) */
export function ProformaNotes({ ctx }) {
  const t = useT();
  return (
    <section className="fcard">
      <header className="fcard-head"><h3>{t("d.pf.notes")}</h3></header>
      <div className="fsec-body">
        <div className="field">
          <label htmlFor="f_proforma_decl">{t("d.pf.decl")}</label>
          <textarea id="f_proforma_decl" className="textarea" rows={2} value={ctx.state.proforma?.declaration ?? ""} onChange={(e) => setField(ctx, "proforma.declaration", e.target.value)} />
          <p className="muted">{t("d.pf.declHint")}</p>
        </div>
        <div className="field">
          <label htmlFor="f_proforma_notes">{t("d.pf.notes")}</label>
          <textarea id="f_proforma_notes" className="textarea" rows={4} value={ctx.state.proforma?.notes || ""} onChange={(e) => setField(ctx, "proforma.notes", e.target.value)} />
          <p className="muted">{t("d.pf.notesHint")}</p>
        </div>
      </div>
    </section>
  );
}
