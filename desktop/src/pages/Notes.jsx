import { useEffect, useMemo, useRef, useState } from "react";
import * as store from "@engine/store.js";
import { useT, getLang } from "../lib/i18n.js";
import { askConfirm } from "../lib/confirm.js";
import { Icon, Spinner } from "../components/Icons.jsx";
import { CardDialog } from "../components/notes/CardDialog.jsx";
import { ColumnsDialog } from "../components/notes/ColumnsDialog.jsx";
import { addCard, addColumn, cardsOf, checkCard, deleteCard, deleteColumn, indexBefore, isOverdue, moveCard, moveColumn, normalizeBoard, renameColumn, setColumnColor, updateCard, COLORS, LABELS } from "../notes/board.mjs";

export function Notes() {
  const t = useT();
  const names = () => [t("d.nt.col.todo"), t("d.nt.col.doing"), t("d.nt.col.done")];
  const [board, setBoard] = useState(null); // null: yükleniyor
  const ready = useRef(false);
  const [filter, setFilter] = useState("all");
  const [edit, setEdit] = useState(null); // düzenlenen kartın kimliği
  const [creating, setCreating] = useState(null); // yeni kart penceresi: { columnId }
  const [renaming, setRenaming] = useState(null); // { colId, value }
  const [orderOpen, setOrderOpen] = useState(false); // sütun sırası penceresi
  const [palette, setPalette] = useState(null); // renk paleti açık olan sütunun kimliği
  const [drag, setDrag] = useState(null); // { id }
  const [over, setOver] = useState(null); // { colId, before }

  useEffect(() => {
    let alive = true;
    store.kvGet("notes").then((v) => { if (!alive) return; setBoard(normalizeBoard(v, names())); ready.current = true; });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (board && ready.current) store.kvSet("notes", board); }, [board]);

  const lang = getLang();
  const dueText = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "short" }); };
  const visible = (colId) => cardsOf(board, colId).filter((c) => filter === "all" || c.label === filter);
  const editing = useMemo(() => board?.cards.find((c) => c.id === edit) || null, [board, edit]);

  if (!board) return <div className="page page--center"><Spinner /></div>;
  const last = board.columns[board.columns.length - 1];

  const submitRename = () => { if (renaming) setBoard((b) => renameColumn(b, renaming.colId, renaming.value)); setRenaming(null); };
  const removeColumn = async (col) => {
    const n = board.cards.filter((c) => c.columnId === col.id).length;
    const ok = await askConfirm({ title: t("d.nt.delCol"), message: n ? t("d.nt.delColCards", { name: col.name, n }) : t("d.nt.delColEmpty", { name: col.name }), confirmLabel: t("d.nt.delete") });
    if (ok) setBoard((b) => deleteColumn(b, col.id));
  };
  const removeCard = async (card) => {
    const ok = await askConfirm({ title: t("d.nt.delCard"), message: t("d.nt.delCardMsg", { name: card.title }), confirmLabel: t("d.nt.delete") });
    if (ok) { setBoard((b) => deleteCard(b, card.id)); setEdit(null); }
  };

  const onDragOver = (e, col) => {
    if (!drag) return;
    e.preventDefault();
    const cards = [...e.currentTarget.querySelectorAll("[data-card]")].filter((el) => el.dataset.card !== drag.id);
    const next = cards.find((el) => { const r = el.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    setOver({ colId: col.id, before: next ? next.dataset.card : null });
  };
  const onDrop = (e, col) => {
    e.preventDefault();
    if (drag && over) setBoard((b) => moveCard(b, drag.id, col.id, indexBefore(b, col.id, over.before, drag.id)));
    setDrag(null); setOver(null);
  };

  return (
    <div className="page page--wide">
      <header className="page-head">
        <div><h1>{t("d.nt.title")}</h1><p className="muted">{t("d.nt.subtitle")}</p></div>
        <div className="nt-tools">
        <button type="button" className="icon-btn" title={t("d.nt.cols")} aria-label={t("d.nt.cols")} onClick={() => setOrderOpen(true)}><Icon name="gear" /></button>
        <div className="segmented" role="group" aria-label={t("d.nt.filter")}>
          {["all", ...LABELS].map((k) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{t(`d.nt.filter.${k}`)}</button>)}
        </div>
        </div>
      </header>

      <div className="nt-board">
        {board.columns.map((col) => (
          <section key={col.id} data-color={col.color || undefined} className={`nt-col${over?.colId === col.id ? " is-over" : ""}`} onDragOver={(e) => onDragOver(e, col)} onDrop={(e) => onDrop(e, col)} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver((o) => (o?.colId === col.id ? null : o)); }}>
            <header className="nt-col-head">
              <button type="button" className="nt-dot" title={t("d.nt.color")} aria-label={t("d.nt.color")} aria-expanded={palette === col.id} onClick={() => setPalette((p) => (p === col.id ? null : col.id))} />
              {renaming?.colId === col.id ? (
                <input className="input nt-rename" value={renaming.value} autoFocus onChange={(e) => setRenaming({ colId: col.id, value: e.target.value })} onBlur={submitRename} onKeyDown={(e) => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") setRenaming(null); }} aria-label={t("d.nt.renameCol")} />
              ) : (
                <h2 className="nt-col-name" title={t("d.nt.renameCol")} onClick={() => setRenaming({ colId: col.id, value: col.name })}>{col.name}</h2>
              )}
              <span className="nt-count">{cardsOf(board, col.id).length}</span>
              {board.columns.length > 1 && <button type="button" className="icon-btn icon-btn--plain icon-btn--danger nt-col-del" title={t("d.nt.delCol")} aria-label={t("d.nt.delCol")} onClick={() => removeColumn(col)}><Icon name="trash" /></button>}
            </header>
            {palette === col.id && (
              <div className="nt-palette" role="group" aria-label={t("d.nt.color")}>
                {[null, ...COLORS].map((k) => (
                  <button key={k || "none"} type="button" className={`nt-swatch${(col.color || null) === k ? " is-on" : ""}`} data-swatch={k || "none"} title={t(`d.nt.color.${k || "none"}`)} aria-label={t(`d.nt.color.${k || "none"}`)} aria-pressed={(col.color || null) === k} onClick={() => { setBoard((b) => setColumnColor(b, col.id, k)); setPalette(null); }} />
                ))}
              </div>
            )}
            <div className="nt-cards">
              {visible(col.id).map((c) => (
                <div key={c.id} className="nt-slot">
                  {over?.colId === col.id && over.before === c.id && drag?.id !== c.id && <div className="nt-drop" />}
                  <article data-card={c.id} className={`nt-card${drag?.id === c.id ? " is-drag" : ""}`} draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", c.id); setDrag({ id: c.id }); }} onDragEnd={() => { setDrag(null); setOver(null); }} onClick={() => setEdit(c.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setEdit(c.id); }}>
                    {c.label && <span className={`nt-tag nt-tag--${c.label}`}>{t(`d.nt.label.${c.label}`)}</span>}
                    <b>{c.title}</b>
                    {c.note && <p>{c.note}</p>}
                    {c.due && <span className={`nt-due${isOverdue(board, c) ? " is-late" : ""}`}><Icon name="calendar" />{dueText(c.due)}{isOverdue(board, c) ? ` · ${t("d.nt.late")}` : ""}</span>}
                  </article>
                </div>
              ))}
              {over?.colId === col.id && over.before === null && <div className="nt-drop" />}
            </div>
            <button type="button" className="nt-addbtn" onClick={() => setCreating({ columnId: col.id })}><Icon name="plus" />{t("d.nt.addCard")}</button>
          </section>
        ))}
      </div>

      {orderOpen && <ColumnsDialog columns={board.columns} cardCount={(id) => board.cards.filter((c) => c.columnId === id).length} onMove={(id, to) => setBoard((b) => moveColumn(b, id, to))} onAdd={(name) => setBoard((b) => addColumn(b, name))} onClose={() => setOrderOpen(false)} />}

      {creating && (
        <CardDialog key="new-card" isNew card={{ title: "", note: "", label: filter === "all" ? null : filter, due: null, columnId: creating.columnId }} columns={board.columns} onClose={() => setCreating(null)}
          onSave={(fields) => { setBoard((b) => addCard(b, fields.columnId, fields)); setCreating(null); }} />
      )}

      {editing && (
        <CardDialog key={editing.id} card={editing} columns={board.columns} onClose={() => setEdit(null)} onDelete={() => removeCard(editing)}
          onSave={(patch) => { setBoard((b) => updateCard(b, editing.id, patch)); setEdit(null); }} />
      )}
    </div>
  );
}
