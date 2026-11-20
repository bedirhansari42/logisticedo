import { useEffect, useRef, useState } from "react";
import { useT } from "../../lib/i18n.js";
import { Icon } from "../Icons.jsx";
import { checkCard, LABELS, LIMITS } from "../../notes/board.mjs";

/** Kart penceresi: başlık, not, etiket, son tarih, sütun. isNew: yeni kart ekleme (silme yok, düğme "Ekle"); değilse düzenleme + silme. */
export function CardDialog({ card, columns, isNew = false, onSave, onDelete, onClose }) {
  const t = useT();
  const dlg = useRef(null);
  const [f, setF] = useState({ title: card.title, note: card.note || "", label: card.label || "", due: card.due || "", columnId: card.columnId });
  const [err, setErr] = useState(null);
  useEffect(() => {
    const d = dlg.current;
    if (d && !d.open) d.showModal();
    // showModal ilk odaklanabilir öğeye (kapat düğmesi) odaklar; yeni kartta doğrudan başlığa yazılabilsin
    d?.querySelector("input.input")?.focus();
  }, []);
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setErr(null); };
  const save = (e) => {
    e.preventDefault();
    const r = checkCard(f);
    if (!r.ok) { setErr(r); return; }
    onSave({ title: f.title, note: f.note, label: f.label || null, due: f.due || null, columnId: f.columnId });
  };
  const bad = (field) => err?.field === field;
  return (
    <dialog ref={dlg} className="dialog dialog--card" aria-labelledby="nt-dlg-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <form className="dialog-inner" onSubmit={save}>
        <div className="dialog-head">
          <h2 id="nt-dlg-title">{t(isNew ? "d.nt.newCard" : "d.nt.card")}</h2>
          <button type="button" className="icon-btn icon-btn--plain" onClick={onClose} aria-label={t("d.confirm.cancel")}><Icon name="close" /></button>
        </div>
        <div className="dialog-body nt-form">
          <label className="field"><span>{t("d.nt.f.title")}</span>
            <input className={`input${bad("title") ? " is-bad" : ""}`} value={f.title} maxLength={LIMITS.title + 20} onChange={set("title")} autoFocus aria-invalid={bad("title")} /></label>
          <label className="field"><span>{t("d.nt.f.note")}</span>
            <textarea className={`textarea${bad("note") ? " is-bad" : ""}`} rows={5} value={f.note} onChange={set("note")} aria-invalid={bad("note")} /></label>
          <div className="nt-row">
            <label className="field"><span>{t("d.nt.f.label")}</span>
              <select className="select" value={f.label} onChange={set("label")}>
                <option value="">{t("d.nt.label.none")}</option>
                {LABELS.map((l) => <option key={l} value={l}>{t(`d.nt.label.${l}`)}</option>)}
              </select></label>
            <label className="field"><span>{t("d.nt.f.due")}</span>
              <input type="date" className={`input${bad("due") ? " is-bad" : ""}`} value={f.due} onChange={set("due")} aria-invalid={bad("due")} /></label>
            <label className="field"><span>{t("d.nt.f.column")}</span>
              <select className="select" value={f.columnId} onChange={set("columnId")}>
                {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
          </div>
          {err && <p className="pl-err">{t(err.key)}</p>}
        </div>
        <div className="dialog-foot nt-foot">
          {!isNew && <button type="button" className="btn btn--quiet btn--sm nt-del" onClick={onDelete}><Icon name="trash" />{t("d.nt.delete")}</button>}
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{t("d.confirm.cancel")}</button>
          <button type="submit" className="btn btn--primary btn--sm">{t(isNew ? "d.nt.add" : "d.nt.save")}</button>
        </div>
      </form>
    </dialog>
  );
}
