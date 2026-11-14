import { useEffect, useRef, useState } from "react";
import { ICONS } from "@common";
import { buildPdf } from "@engine/pdf-builder.js";
import { renderPdfInto } from "@engine/preview.js";
import { missingFields } from "@engine/doc-model.js";
import { useT } from "../lib/i18n.js";
import { Icon, Spinner } from "./Icons.jsx";

/** Alan genişliği değişince (pencere yeniden boyutlandı) kayıtlı PDF'i yeni genişliğe göre yeniden çizer.
   PDF baştan üretilmez; kaydırma konumu oransal korunur. */
function useRerenderOnResize(stageRef, pagesRef, bytesRef) {
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    let last = el.clientWidth;
    let timer;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (Math.abs(w - last) < 6) return;
      last = w;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (!bytesRef.current || !pagesRef.current) return;
        const ratio = el.scrollHeight ? el.scrollTop / el.scrollHeight : 0;
        try {
          const n = await renderPdfInto(pagesRef.current, bytesRef.current);
          if (n != null) el.scrollTop = ratio * el.scrollHeight;
        } catch { /* sonraki boyut değişikliğinde yeniden denenir */ }
      }, 160);
    });
    ro.observe(el);
    return () => { ro.disconnect(); clearTimeout(timer); };
  }, [stageRef, pagesRef, bytesRef]);
}

/** Canlı PDF önizleme. Önizleme, indirilen dosyanın kendisidir. */
export function Preview({ state, lh, doc, onDownload, busyKey, xlsxKind = "xlsx", missing }) {
  const t = useT();
  const pagesRef = useRef(null);
  const stageRef = useRef(null);
  const bytesRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [pages, setPages] = useState(null);
  const [menu, setMenu] = useState(false);
  const [big, setBig] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    let cancelled = false;
    const delay = first.current ? 0 : 320;
    first.current = false;
    const timer = setTimeout(async () => {
      const loadTimer = setTimeout(() => { if (!cancelled) setBusy(true); }, 180);
      try {
        const bytes = await buildPdf(state, lh, doc);
        if (cancelled) return;
        bytesRef.current = bytes;
        const n = await renderPdfInto(pagesRef.current, bytes);
        if (!cancelled && n != null) { setPages(n); setErr(null); }
      } catch (e) {
        if (!cancelled) { console.error(e); setErr(e.message || String(e)); }
      } finally {
        clearTimeout(loadTimer);
        if (!cancelled) setBusy(false);
      }
    }, delay);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [state, lh, doc]);

  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (!e.target.closest?.(".pv-more")) setMenu(false); };
    const esc = (e) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", esc); };
  }, [menu]);

  useRerenderOnResize(stageRef, pagesRef, bytesRef);

  const miss = missing ?? missingFields(state);
  const title = t(`pv.${doc}`);
  const stop = (e) => e.preventDefault();

  return (
    <div className="pv-card">
      <div className="pv-bar">
        <div className="pv-bar-info">
          <strong className="pv-title" lang="en">{title}</strong>
          <span className="pv-meta">{pages == null ? "" : pages === 1 ? t("pv.page1") : t("pv.pages", { n: pages })}</span>
        </div>
        <div className="pv-bar-actions">
          <button className="btn btn--ghost btn--sm pv-open" type="button" onClick={() => setBig(true)}><Icon name="expand" /><span>{t("pv.open")}</span></button>
          <button className="icon-btn" type="button" title={t("pv.dlThis")} aria-label={t("pv.dlThis")} disabled={busyKey === doc} onClick={() => onDownload(doc)} dangerouslySetInnerHTML={{ __html: ICONS.download }} />
          <div className="pv-more">
            <button className="icon-btn icon-btn--plain" type="button" aria-haspopup="menu" aria-expanded={menu} title={t("pv.dlMore")} aria-label={t("pv.dlMore")} onClick={(e) => { e.stopPropagation(); setMenu((m) => !m); }}><Icon name="more" /></button>
            {menu && (
              <div className="pv-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMenu(false); onDownload(xlsxKind); }}>{t("pv.dlXlsx")}</button>
              </div>
            )}
          </div>
        </div>
      </div>
      {miss.length > 0 && (
        <div className="pv-issues">
          <span dangerouslySetInnerHTML={{ __html: ICONS.warn }} />
          <span>{t("pv.missing", { list: miss.map((k) => t(k)).join(", ") })}</span>
        </div>
      )}
      <div className="pv-stage" ref={stageRef} onContextMenu={stop} onDragStart={stop} onCopy={stop}>
        <div className="pv-pages" ref={pagesRef} />
        {err && <div className="pv-error">{t("pv.error", { msg: err })}</div>}
        {busy && <div className="pv-loading"><Spinner /><span>{t("pv.rendering")}</span></div>}
      </div>
      {big && <BigPreview title={title} bytesRef={bytesRef} state={state} lh={lh} doc={doc} onClose={() => setBig(false)} onDownload={() => onDownload(doc)} />}
    </div>
  );
}

function BigPreview({ title, bytesRef, state, lh, doc, onClose, onDownload }) {
  const t = useT();
  const dlg = useRef(null);
  const pages = useRef(null);
  const body = useRef(null);
  const [loading, setLoading] = useState(true);
  const bigBytes = useRef(bytesRef.current);
  useRerenderOnResize(body, pages, bigBytes);

  useEffect(() => {
    const d = dlg.current;
    if (d && !d.open) d.showModal();
    let alive = true;
    (async () => {
      try {
        const bytes = bytesRef.current || await buildPdf(state, lh, doc);
        bigBytes.current = bytes;
        if (alive) await renderPdfInto(pages.current, bytes);
      } catch (e) { console.error(e); } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <dialog ref={dlg} className="dialog dialog--pv" onClose={onClose} onClick={(e) => { if (e.target === dlg.current) dlg.current.close(); }}>
      <div className="dialog-inner">
        <header className="dialog-head">
          <h2 lang="en">{title}</h2>
          <div className="pvd-actions">
            <button className="icon-btn" type="button" title={t("pv.dlThis")} aria-label={t("pv.dlThis")} onClick={onDownload} dangerouslySetInnerHTML={{ __html: ICONS.download }} />
            <button className="icon-btn icon-btn--plain" type="button" title={t("common.close")} aria-label={t("common.close")} onClick={() => dlg.current.close()}><Icon name="close" /></button>
          </div>
        </header>
        <div className="pvd-body" ref={body} onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()} onCopy={(e) => e.preventDefault()}>
          <div className="pv-pages" ref={pages} />
          {loading && <div className="pv-loading"><Spinner /><span>{t("pv.rendering")}</span></div>}
        </div>
      </div>
    </dialog>
  );
}
