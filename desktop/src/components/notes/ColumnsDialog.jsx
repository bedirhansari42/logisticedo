import { useEffect, useRef, useState } from "react";
import { useT } from "../../lib/i18n.js";
import { Icon } from "../Icons.jsx";

/** Sütun sırası penceresi: her sütun yukarı/aşağı okla taşınır, değişiklik anında uygulanır. */
export function ColumnsDialog({ columns, cardCount, onMove, onAdd, onClose }) {
  const t = useT();
  const dlg = useRef(null);
  const [name, setName] = useState("");
  const add = () => { if (!name.trim()) return; onAdd(name); setName(""); };
  useEffect(() => { const d = dlg.current; if (d && !d.open) d.showModal(); }, []);
  return (
    <dialog ref={dlg} className="dialog dialog--card" aria-labelledby="nt-cols-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <div className="dialog-inner">
        <div className="dialog-head">
          <h2 id="nt-cols-title">{t("d.nt.cols")}</h2>
          <button type="button" className="icon-btn icon-btn--plain" onClick={onClose} aria-label={t("d.nt.done")}><Icon name="close" /></button>
        </div>
        <div className="dialog-body nt-form">
          <p className="muted pl-hint">{t("d.nt.colsHint")}</p>
          <ol className="nt-order">
            {columns.map((c, i) => (
              <li key={c.id} className="nt-order-row" data-color={c.color || undefined}>
                <span className="nt-order-name">{c.name}</span>
                <span className="nt-count">{cardCount(c.id)}</span>
                <button type="button" className="icon-btn icon-btn--plain" disabled={i === 0} onClick={() => onMove(c.id, i - 1)} title={t("d.nt.up")} aria-label={`${t("d.nt.up")}: ${c.name}`}><Icon name="arrowUp" /></button>
                <button type="button" className="icon-btn icon-btn--plain" disabled={i === columns.length - 1} onClick={() => onMove(c.id, i + 1)} title={t("d.nt.down")} aria-label={`${t("d.nt.down")}: ${c.name}`}><Icon name="arrowDown" /></button>
              </li>
            ))}
          </ol>
          <div className="nt-addcol">
            <input className="input" value={name} placeholder={t("d.nt.colPh")} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} aria-label={t("d.nt.addCol")} />
            <button type="button" className="btn btn--ghost btn--sm" onClick={add} disabled={!name.trim()}><Icon name="plus" />{t("d.nt.addCol")}</button>
          </div>
        </div>
        <div className="dialog-foot">
          <button type="button" className="btn btn--primary btn--sm" onClick={onClose}>{t("d.nt.done")}</button>
        </div>
      </div>
    </dialog>
  );
}
