import { useEffect, useReducer, useRef, useState } from "react";
import { useT } from "../lib/i18n.js";
import { checkForUpdate, openRelease, updateApi, canUseInstall, startInstall, applyInstall, cancelInstall, onInstallProgress } from "../update/api.mjs";
import { shouldNotify, loadSkipped, skipVersion } from "../update/state.mjs";
import { initialInstall, nextInstall, canInstall } from "../update/install.mjs";

const FIRST_CHECK_MS = 3000;
const CHECK_EVERY_MS = 24 * 3600 * 1000;
const RETRY_BLOCKED_MS = 60 * 1000;

/** Açılışta (sonra 24 saatte bir) yeni kararlı sürüm var mı diye bakar; varsa "Güncelle / Sonra / Bu sürümü atla" penceresi çıkar.
    "Güncelle" paketi ana süreçte indirir ve doğrular (ilerleme çubuğu), sonra "Yeniden başlat ve kur" çıkar. Kurulum desteklenmiyorsa
    (köprü eski, taşınabilir sürüm, hata) eski yol kalır: release sayfasını tarayıcıda aç. Karar mantığı update/state.mjs ve update/install.mjs'te.
    "Sonra" yalnızca bu oturum içindir; indirme sürerken pencere gizlenir, indirme sürer, bitince pencere yeniden çıkar. */
export function UpdateNotice() {
  const t = useT();
  const [found, setFound] = useState(null); // { version, url, current }
  const [dismissed, setDismissed] = useState("");
  const [open, setOpen] = useState(false);
  const [inst, dispatch] = useReducer(nextInstall, initialInstall);
  const dismissedRef = useRef("");
  const ref = useRef(null);
  const laterRef = useRef(null);
  const hasBridge = canUseInstall();

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

  // Ayarlar'daki "Güncelle" düğmesi aynı pencereyi açar
  useEffect(() => {
    const on = (e) => {
      const d = e.detail;
      if (!d || typeof d.version !== "string" || typeof d.url !== "string") return;
      dismissedRef.current = ""; setDismissed("");
      setFound({ version: d.version, url: d.url, current: d.current || "" });
      setOpen(true);
    };
    window.addEventListener("lgx:update:show", on);
    return () => window.removeEventListener("lgx:update:show", on);
  }, []);

  // Ana süreçten ilerleme olayları (pencere gizliyken de dinlenir)
  useEffect(() => onInstallProgress((p) => dispatch({ type: "progress", ...p })), []);

  // İndirme bitince ya da hata verince, pencere gizlenmişse yeniden göster
  useEffect(() => { if (found && (inst.phase === "ready" || inst.phase === "error")) setOpen(true); }, [inst.phase, found]);

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

  const busy = inst.phase === "downloading";
  // İndirme ya da hazır paket varken "Sonra" yalnızca pencereyi gizler; aksi hâlde bu sürüm bu oturumda ertelenir
  const hide = () => {
    setOpen(false);
    if (busy || inst.phase === "ready") return;
    dismissedRef.current = found.version; setDismissed(found.version);
    if (inst.phase === "error") dispatch({ type: "reset" });
  };
  const skip = () => { skipVersion(found.version); hide(); };
  const browser = async () => { await openRelease(found.url); hide(); };
  const install = async () => {
    dispatch({ type: "start" });
    const r = await startInstall();
    if (!r.ok) dispatch({ type: "progress", state: "error", reason: r.reason });
  };
  const restart = async () => {
    const r = await applyInstall();
    if (!r.ok) dispatch({ type: "progress", state: "error", reason: r.reason });
  };
  const cancel = async () => { await cancelInstall(); dispatch({ type: "reset" }); };

  if (!show || !open) return null;
  const vars = { latest: `v${found.version}`, current: `v${found.current}` };
  return (
    <dialog ref={ref} className="dialog dialog--confirm" aria-labelledby="upd-title" aria-describedby="upd-msg" onCancel={(e) => { e.preventDefault(); hide(); }}>
      <div className="dialog-inner">
        <div className="dialog-head"><h2 id="upd-title">{t("d.upd.title")}</h2></div>
        <p id="upd-msg" className="dialog-msg" role={inst.phase === "error" ? "alert" : undefined}>
          {inst.phase === "ready" ? t("d.upd.readyMsg")
            : inst.phase === "error" ? t(`d.upd.err.${inst.reason}`)
            : inst.phase === "downloading" ? t("d.upd.downloading", { pct: inst.percent })
            : t("d.upd.msg", vars)}
        </p>
        {busy && <progress className="upd-progress" max="100" value={inst.percent} aria-label={t("d.upd.downloading", { pct: inst.percent })} />}
        <div className="dialog-foot">
          {inst.phase === "offer" && <button type="button" className="btn btn--quiet btn--sm" onClick={skip}>{t("d.upd.skip")}</button>}
          {busy && <button type="button" className="btn btn--quiet btn--sm" onClick={cancel}>{t("d.upd.cancel")}</button>}
          <button ref={laterRef} type="button" className="btn btn--ghost btn--sm" onClick={hide}>{busy || inst.phase === "ready" ? t("d.upd.hide") : t("d.upd.later")}</button>
          {inst.phase === "offer" && (canInstall({ hasBridge })
            ? <button type="button" className="btn btn--primary btn--sm" onClick={install}>{t("d.upd.install")}</button>
            : <button type="button" className="btn btn--primary btn--sm" onClick={browser}>{t("d.upd.download")}</button>)}
          {inst.phase === "ready" && <button type="button" className="btn btn--primary btn--sm" onClick={restart}>{t("d.upd.restart")}</button>}
          {inst.phase === "error" && <button type="button" className="btn btn--primary btn--sm" onClick={browser}>{t("d.upd.openBrowser")}</button>}
        </div>
      </div>
    </dialog>
  );
}
