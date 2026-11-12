import { useEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n.js";
import { Icon } from "./Icons.jsx";

const PT_PER_MM = 72 / 25.4;
const EDGES = ["top", "bottom", "left", "right"];

/** Antet kenar boşluğu ayarı: yeşil çerçeve içerik alanıdır, kenarlar sürüklenir. */
export function LetterheadDialog({ rec, isNew, onClose, onSave }) {
  const t = useT();
  const dlg = useRef(null);
  const pageRef = useRef(null);
  const [name, setName] = useState("");
  const [applyTo, setApplyTo] = useState("all");
  const [m, setM] = useState({ top: 0, bottom: 0, left: 0, right: 0 });
  const [img, setImg] = useState(null);
  const P = { w: rec.pageWidth / PT_PER_MM, h: rec.pageHeight / PT_PER_MM };

  useEffect(() => {
    setName(rec.name || "");
    setApplyTo(rec.applyTo || "all");
    setM({ ...rec.margins });
    const url = rec.preview ? URL.createObjectURL(rec.preview) : null;
    setImg(url || rec.thumb);
    const d = dlg.current;
    if (d && !d.open) d.showModal();
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [rec]);

  const clamp = (edge, v, cur) => {
    if (edge === "top") return Math.round(Math.min(Math.max(v, 5), P.h - cur.bottom - 60));
    if (edge === "bottom") return Math.round(Math.min(Math.max(v, 5), P.h - cur.top - 60));
    if (edge === "left") return Math.round(Math.min(Math.max(v, 5), P.w - cur.right - 80));
    return Math.round(Math.min(Math.max(v, 5), P.w - cur.left - 80));
  };

  const startDrag = (e, edge) => {
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture?.(e.pointerId);
    const move = (ev) => {
      const r = pageRef.current.getBoundingClientRect();
      const v = edge === "top" ? ((ev.clientY - r.top) / r.height) * P.h
        : edge === "bottom" ? ((r.bottom - ev.clientY) / r.height) * P.h
        : edge === "left" ? ((ev.clientX - r.left) / r.width) * P.w
        : ((r.right - ev.clientX) / r.width) * P.w;
      setM((cur) => ({ ...cur, [edge]: clamp(edge, v, cur) }));
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const save = (e) => {
    e.preventDefault();
    onSave({ ...rec, name: name.trim() || rec.fileName || "Antet", applyTo, margins: m });
    dlg.current.close();
  };

  const labels = { top: "lhd.top", bottom: "lhd.bottom", left: "lhd.left", right: "lhd.right" };

  return (
    <dialog ref={dlg} className="dialog" onClose={onClose}>
      <form className="dialog-inner" onSubmit={save}>
        <header className="dialog-head">
          <h2>{t("lhd.title")}</h2>
          <button className="icon-btn icon-btn--plain" type="button" aria-label={t("common.close")} onClick={() => dlg.current.close()}><Icon name="close" /></button>
        </header>
        <div className="dialog-body">
          <div className="lhd-stage">
            <div className="lhd-page" ref={pageRef} style={{ aspectRatio: `${rec.pageWidth} / ${rec.pageHeight}` }}>
              <img src={img || undefined} alt="" />
              <div className="lhd-area" style={{ top: `${(m.top / P.h) * 100}%`, bottom: `${(m.bottom / P.h) * 100}%`, left: `${(m.left / P.w) * 100}%`, right: `${(m.right / P.w) * 100}%` }}>
                <span className="lhd-area-label">{t("lhd.content")}</span>
                <span className="lhd-ghost" aria-hidden="true"><i /><i /><i /><i /><i /></span>
                {EDGES.map((edge) => <span key={edge} className="lhd-handle" data-edge={edge} aria-hidden="true" onPointerDown={(e) => startDrag(e, edge)} />)}
              </div>
            </div>
          </div>
          <div className="lhd-side">
            <p className="lhd-desc">{t("lhd.desc")}</p>
            <div className="field"><label htmlFor="lhdName">{t("lhd.name")}</label><input className="input" id="lhdName" maxLength={60} placeholder={t("lhd.namePh")} value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="lhd-margins">
              {EDGES.map((edge) => (
                <div className="field" key={edge}>
                  <label htmlFor={`lhd_${edge}`}>{t(labels[edge])}</label>
                  <input className="input" type="number" id={`lhd_${edge}`} min={5} max={edge === "top" || edge === "bottom" ? 200 : 100} step={1} value={m[edge]} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setM((cur) => ({ ...cur, [edge]: clamp(edge, v, cur) })); }} />
                </div>
              ))}
            </div>
            <fieldset className="lhd-apply">
              <legend className="field-label">{t("lhd.apply")}</legend>
              <label className="check"><input type="radio" name="lhdApply" checked={applyTo === "all"} onChange={() => setApplyTo("all")} /><span>{t("lhd.applyAll")}</span></label>
              <label className="check"><input type="radio" name="lhdApply" checked={applyTo === "first"} onChange={() => setApplyTo("first")} /><span>{t("lhd.applyFirst")}</span></label>
            </fieldset>
            {isNew && <p className="chip chip--ok lhd-auto"><span>{t("lhd.auto")}</span></p>}
            <ul className="lhd-notes">{(rec.notes || []).map((k) => <li key={k}>{t(k)}</li>)}</ul>
          </div>
        </div>
        <footer className="dialog-foot">
          <button className="btn btn--quiet" type="button" onClick={() => dlg.current.close()}>{t("lhd.cancel")}</button>
          <button className="btn btn--primary" type="submit">{t("lhd.save")}</button>
        </footer>
      </form>
    </dialog>
  );
}
