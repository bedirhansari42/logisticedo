import { useState } from "react";
import { toast, ICONS } from "@common";
import { useT } from "../lib/i18n.js";
import { useApp } from "../lib/app-context.jsx";
import { processLetterheadFile } from "@engine/letterhead.js";
import { Dropzone } from "../components/Dropzone.jsx";
import { LetterheadDialog } from "../components/LetterheadDialog.jsx";

function Card({ id, name, sub, thumb, selected, onSelect, onEdit, onDelete }) {
  const t = useT();
  return (
    <div className="lh-card" role="radio" aria-checked={selected} tabIndex={0} onClick={() => onSelect(id)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(id); } }}>
      <div className={`lh-thumb${thumb ? "" : " lh-thumb--none"}`}>{thumb ? <img src={thumb} alt="" /> : <span dangerouslySetInnerHTML={{ __html: ICONS.blank }} />}</div>
      <div className="lh-info"><strong title={name}>{name}</strong><span>{sub || ""}</span></div>
      <span className="lh-badge" dangerouslySetInnerHTML={{ __html: ICONS.check }} />
      {onEdit && (
        <div className="lh-actions">
          <button type="button" className="icon-btn icon-btn--plain" title={t("lh.edit")} aria-label={t("lh.edit")} onClick={(e) => { e.stopPropagation(); onEdit(id); }} dangerouslySetInnerHTML={{ __html: ICONS.sliders }} />
          <button type="button" className="icon-btn icon-btn--plain icon-btn--danger" title={t("lh.delete")} aria-label={t("lh.delete")} onClick={(e) => { e.stopPropagation(); onDelete(id); }} dangerouslySetInnerHTML={{ __html: ICONS.trash }} />
        </div>
      )}
    </div>
  );
}

export function Letterheads() {
  const t = useT();
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [dlg, setDlg] = useState(null); // { rec, isNew }

  const onFile = async (file) => {
    setBusy(true);
    try {
      const rec = await processLetterheadFile(file);
      setDlg({ rec, isNew: true });
    } catch (e) {
      console.error(e);
      toast(e.key ? t(e.key, e.vars) : t("lh.err.failed", { msg: e.message || String(e) }), "error", 8000);
    } finally {
      setBusy(false);
    }
  };

  const onSave = async (rec) => {
    const isNew = dlg?.isNew;
    const ok = await app.saveLetterhead(rec);
    if (isNew) app.setDefaultLh(rec.id);
    toast(ok ? t("lh.saved") : t("lh.storageFail"), ok ? "ok" : "warn", ok ? 3500 : 8000);
  };

  const onDelete = async (id) => {
    const rec = app.getLetterhead(id);
    if (!rec || !window.confirm(t("lh.confirmDelete", { name: rec.name }))) return;
    await app.deleteLetterhead(id);
    toast(t("lh.deleted"));
  };

  return (
    <div className="page">
      <header className="page-head"><div><h1>{t("d.lh.title")}</h1><p className="muted">{t("d.lh.lead")}</p></div></header>
      <section className="card-block pad">
        <Dropzone compact onFile={onFile} busy={busy} accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg" title={t("lh.drop")} sub={t("lh.formats")} />
        <p className="panel-note">{t("lh.tip")} {!app.persistent && <span className="warn-text">{t("lh.storageFail")}</span>}</p>
        <div className="lh-grid" role="radiogroup" aria-label={t("d.lh.title")}>
          <Card id="none" name={t("lh.none")} sub={t("lh.noneDesc")} selected={app.defaultLhId === "none"} onSelect={app.setDefaultLh} />
          {app.letterheads.map((l) => (
            <Card key={l.id} id={l.id} name={l.name} sub={(l.sourceType || "").toUpperCase()} thumb={l.thumb} selected={app.defaultLhId === l.id} onSelect={app.setDefaultLh} onEdit={(id) => setDlg({ rec: app.getLetterhead(id), isNew: false })} onDelete={onDelete} />
          ))}
        </div>
        <p className="muted">{t("d.lh.defaultHint")}</p>
      </section>
      {dlg && <LetterheadDialog rec={dlg.rec} isNew={dlg.isNew} onClose={() => setDlg(null)} onSave={onSave} />}
    </div>
  );
}
