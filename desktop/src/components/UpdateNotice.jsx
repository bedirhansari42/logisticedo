import { useEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n.js";
import { checkForUpdate, openRelease, updateApi } from "../update/api.mjs";
import { shouldNotify, loadSkipped, skipVersion } from "../update/state.mjs";

const FIRST_CHECK_MS = 3000;
const CHECK_EVERY_MS = 24 * 3600 * 1000;
const RETRY_BLOCKED_MS = 60 * 1000;

/** Açılışta (sonra 24 saatte bir) yeni kararlı sürüm var mı diye bakar; varsa "İndir / Sonra / Bu sürümü atla" penceresi çıkar.
    Karar mantığı update/state.mjs'te. "Sonra" yalnızca bu oturum içindir. Köprü yoksa (tarayıcıda geliştirme) hiçbir şey yapmaz. */
export function UpdateNotice() {
  const t = useT();
  const [found, setFound] = useState(null); // { version, url, current }
  const [dismissed, setDismissed] = useState("");
  const [open, setOpen] = useState(false);
  const dismissedRef = useRef("");
  const ref = useRef(null);
  const laterRef = useRef(null);

  useEffect(() => {
    if (!updateApi()) return;
    const run = async () => {
      const r = await checkForUpdate();
      if (r.status !== "newer") return;
      if (shouldNotify({ latest: r.latest.version, current: r.current, skipped: loadSkipped(), dismissed: dismissedRef.current })) {
        setFound({ ...r.latest, current: r.current });
      }
    };
    const first = setTimeout(run, FIRST_CHECK_MS);
    const id = setInterval(run, CHECK_EVERY_MS);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);

  const show = !!found && found.version !== dismissed;

  // Başka bir pencere (ör. yedek hatırlatıcı) açıksa üstüne binme; kapanınca açılır
  useEffect(() => {
    if (!show) return;
    const tryOpen = () => {
      if (document.querySelector("dialog[open]")) return false;
      setOpen(true);
      return true;
    };
    if (tryOpen()) return;
    const id = setInterval(() => { if (tryOpen()) clearInterval(id); }, RETRY_BLOCKED_MS);
    return () => clearInterval(id);
  }, [show]);

  // Pencere kendiliğinden çıkar; kullanıcı yazarken Enter/Boşluk "Bu sürümü atla"ya düşmesin diye odak zararsız "Sonra"da başlar
  useEffect(() => {
    if (open && show && ref.current && !ref.current.open) { ref.current.showModal(); laterRef.current?.focus(); }
  }, [open, show]);

  const dismiss = () => { dismissedRef.current = found.version; setDismissed(found.version); setOpen(false); };
  const download = async () => { await openRelease(found.url); dismiss(); };
  const skip = () => { skipVersion(found.version); dismiss(); };

  if (!show || !open) return null;
  return (
    <dialog ref={ref} className="dialog dialog--confirm" aria-labelledby="upd-title" aria-describedby="upd-msg" onCancel={(e) => { e.preventDefault(); dismiss(); }}>
      <div className="dialog-inner">
        <div className="dialog-head"><h2 id="upd-title">{t("d.upd.title")}</h2></div>
        <p id="upd-msg" className="dialog-msg">{t("d.upd.msg", { latest: `v${found.version}`, current: `v${found.current}` })}</p>
        <div className="dialog-foot">
          <button type="button" className="btn btn--quiet btn--sm" onClick={skip}>{t("d.upd.skip")}</button>
          <button ref={laterRef} type="button" className="btn btn--ghost btn--sm" onClick={dismiss}>{t("d.upd.later")}</button>
          <button type="button" className="btn btn--primary btn--sm" onClick={download}>{t("d.upd.download")}</button>
        </div>
      </div>
    </dialog>
  );
}
