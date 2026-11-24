import { useEffect, useRef } from "react";
import { useT } from "../lib/i18n.js";
import { tourEvent } from "../tour/store.mjs";

/** İlk açılışta ortada kısa karşılama (modal). "Başla" rehber kartını açar; "Şimdi değil" ya da Esc tanıtımı kapatır. */
export function TourWelcome() {
  const t = useT();
  const ref = useRef(null);
  const startRef = useRef(null);
  useEffect(() => {
    if (ref.current && !ref.current.open) { ref.current.showModal(); startRef.current?.focus(); } // Enter yanlışlıkla tanıtımı kapatmasın
  }, []);
  return (
    <dialog ref={ref} className="dialog dialog--confirm" aria-labelledby="tour-w-title" aria-describedby="tour-w-msg" onCancel={(e) => { e.preventDefault(); tourEvent("close"); }}>
      <div className="dialog-inner">
        <div className="dialog-head"><h2 id="tour-w-title">{t("d.tour.welcomeTitle")}</h2></div>
        <p id="tour-w-msg" className="dialog-msg">{t("d.tour.welcomeMsg")}</p>
        <div className="dialog-foot">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => tourEvent("close")}>{t("d.tour.notNow")}</button>
          <button ref={startRef} type="button" className="btn btn--primary btn--sm" onClick={() => tourEvent("start")}>{t("d.tour.start")}</button>
        </div>
      </div>
    </dialog>
  );
}
