import { useState } from "react";
import { toast } from "@common";
import { useT } from "../lib/i18n.js";
import { useApp } from "../lib/app-context.jsx";
import { askConfirm } from "../lib/confirm.js";
import { newCompany } from "../lib/company.js";
import { Icon } from "../components/Icons.jsx";

const strip = ({ updatedAt, ...rest }) => JSON.stringify(rest);

export function Companies() {
  const t = useT();
  const app = useApp();
  const [draft, setDraft] = useState(() => (app.companies[0] ? structuredClone(app.companies[0]) : null));
  const [isNew, setIsNew] = useState(false);
  const [editing, setEditing] = useState(false); // kayıtlı kart yalnızca "Kartı düzenle"den sonra değişir

  const saved = draft && !isNew ? app.getCompany(draft.id) : null;
  const locked = !!draft && !isNew && !editing;
  const dirty = !!draft && (isNew || !saved || strip(saved) !== strip(draft));

  const guard = () => !dirty || window.confirm(t("co.unsaved"));
  const open = (c) => { if (!guard()) return; setDraft(structuredClone(c)); setIsNew(false); setEditing(false); };
  const add = () => { if (!guard()) return; setDraft(newCompany()); setIsNew(true); setEditing(false); };
  const cancelEdit = () => { if (saved) setDraft(structuredClone(saved)); setEditing(false); };
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    if (!draft.name.trim()) { toast(t("co.nameReq"), "warn"); return; }
    // Kayıtlı bir kartı değiştirirken onay istenir; yeni kart ilk kez kaydedilirken istenmez
    if (!isNew && !(await askConfirm({ title: t("d.confirm.title"), message: t("co.confirmSave", { name: draft.name.trim() }), confirmLabel: t("co.save") }))) return;
    await app.saveCompany({ ...draft, name: draft.name.trim() });
    setIsNew(false);
    setEditing(false);
    toast(t("co.saved"));
  };

  const remove = async () => {
    const ok = await askConfirm({ title: t("d.confirm.delTitle"), message: t("co.confirmDelete", { name: draft.name || t("co.untitled") }), confirmLabel: t("d.act.del") });
    if (!ok) return;
    if (!isNew) await app.deleteCompany(draft.id);
    const rest = app.companies.filter((c) => c.id !== draft.id);
    setDraft(rest[0] ? structuredClone(rest[0]) : null);
    setIsNew(false);
    setEditing(false);
    toast(t("co.deleted"));
  };

  const list = isNew && draft ? [...app.companies, draft] : app.companies;

  return (
    <div className="page">
      <header className="page-head"><div><h1>{t("co.title")}</h1><p className="muted">{t("co.lead")}</p></div></header>

      <div className={`co-layout${draft ? "" : " co-layout--solo"}`}>
        <section className="card-block pad co-list">
          <div className="block-head">
            <h2 className="block-title">{t("co.list")}</h2>
            <button type="button" className="btn btn--ghost btn--sm" onClick={add}><Icon name="plus" />{t("co.add")}</button>
          </div>
          {list.length === 0 && <p className="muted">{t("co.empty")}</p>}
          <ul className="co-items" role="listbox" aria-label={t("co.list")}>
            {list.map((c) => (
              <li key={c.id}>
                <button type="button" role="option" aria-selected={draft?.id === c.id} className={`co-item${draft?.id === c.id ? " is-on" : ""}`} onClick={() => open(c)}>
                  <strong>{(draft?.id === c.id ? draft.name : c.name) || t("co.untitled")}</strong>
                  <span>{t("co.bankCount", { n: (draft?.id === c.id ? draft.banks : c.banks).length })}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {draft && (
          <section className="card-block pad co-form">
            <div className="field"><label htmlFor="coName">{t("co.name")}</label><input id="coName" className="input" disabled={locked} value={draft.name} onChange={(e) => set({ name: e.target.value })} /></div>
            <div className="field"><label htmlFor="coAddr">{t("co.address")}</label><textarea id="coAddr" className="textarea" rows={3} disabled={locked} value={draft.address} onChange={(e) => set({ address: e.target.value })} /></div>
            <div className="fgrid fgrid--2">
              <div className="field"><label htmlFor="coTax">{t("co.taxId")}</label><input id="coTax" className="input" disabled={locked} value={draft.taxId} onChange={(e) => set({ taxId: e.target.value })} /></div>
              <div className="field"><label htmlFor="coCon">{t("co.contact")}</label><input id="coCon" className="input" disabled={locked} value={draft.contact} onChange={(e) => set({ contact: e.target.value })} /></div>
            </div>
            <h3 className="pl-sub">{t("co.sign")}</h3>
            <div className="fgrid fgrid--3">
              <div className="field"><label htmlFor="coSn">{t("co.signName")}</label><input id="coSn" className="input" disabled={locked} value={draft.signName} onChange={(e) => set({ signName: e.target.value })} /></div>
              <div className="field"><label htmlFor="coSt">{t("co.signTitle")}</label><input id="coSt" className="input" disabled={locked} value={draft.signTitle} onChange={(e) => set({ signTitle: e.target.value })} /></div>
              <div className="field"><label htmlFor="coSp">{t("co.signPlace")}</label><input id="coSp" className="input" disabled={locked} value={draft.signPlace} onChange={(e) => set({ signPlace: e.target.value })} /></div>
            </div>
            <div className="field">
              <label htmlFor="coLh">{t("co.lh")}</label>
              <select id="coLh" className="select" disabled={locked} value={draft.lhId || ""} onChange={(e) => set({ lhId: e.target.value })}>
                <option value="">{t("co.lhNone")}</option>
                {app.letterheads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="co-actions">
              {locked
                ? <button type="button" className="btn btn--primary" onClick={() => setEditing(true)}>{t("co.edit")}</button>
                : <button type="button" className="btn btn--primary" onClick={save} disabled={!dirty}>{t("co.save")}</button>}
              {!locked && !isNew && <button type="button" className="btn btn--ghost" onClick={cancelEdit}>{t("co.cancelEdit")}</button>}
              {dirty && <span className="warn-text">{t("co.unsavedNote")}</span>}
              <button type="button" className="btn btn--quiet btn--danger" onClick={remove}>{t("co.delete")}</button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
