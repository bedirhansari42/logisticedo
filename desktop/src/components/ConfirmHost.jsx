import { useEffect, useRef, useSyncExternalStore } from "react";
import { getConfirm, subscribeConfirm, settleConfirm } from "../lib/confirm.js";
import { useT } from "../lib/i18n.js";

/** askConfirm() çağrılarının penceresi: uygulamanın .dialog görünümünü kullanır; Esc ya da Vazgeç = hayır. */
export function ConfirmHost() {
  const t = useT();
  const c = useSyncExternalStore(subscribeConfirm, getConfirm);
  const ref = useRef(null);
  useEffect(() => { if (c && ref.current && !ref.current.open) ref.current.showModal(); }, [c]);
  if (!c) return null;
  return (
    <dialog ref={ref} className="dialog dialog--confirm" aria-labelledby="cf-title" aria-describedby="cf-msg" onCancel={(e) => { e.preventDefault(); settleConfirm(false); }}>
      <div className="dialog-inner">
        <div className="dialog-head"><h2 id="cf-title">{c.title || t("d.confirm.title")}</h2></div>
        <p id="cf-msg" className="dialog-msg">{c.message}</p>
        <div className="dialog-foot">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => settleConfirm(false)}>{c.cancelLabel || t("d.confirm.cancel")}</button>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => settleConfirm(true)}>{c.confirmLabel || t("d.confirm.ok")}</button>
        </div>
      </div>
    </dialog>
  );
}
