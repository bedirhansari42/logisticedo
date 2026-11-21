import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "@common";
import { useT } from "../lib/i18n.js";
import { useApp } from "../lib/app-context.jsx";
import { getAuto, subscribe } from "../backup/auto.mjs";
import { runManualBackup } from "../backup/manual.js";
import { needsReminder, loadSnooze, snooze, clearSnooze, ago } from "../backup/reminder.mjs";

const CHECK_MS = 60 * 1000;
const FIRST_CHECK_MS = 3000;

/** Son yedek 24 saatten eskiyse (hangi sayfada olursa olsun) "Şimdi yedekle / Sonra hatırlat" penceresi. Mantık reminder.mjs'te. */
export function BackupReminder() {
  const t = useT();
  const { shipments, proformas, letterheads } = useApp();
  const auto = useSyncExternalStore(subscribe, getAuto);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const hasData = shipments.length + proformas.length + letterheads.length > 0;
  const due = () => needsReminder({ lastAt: getAuto().lastAt, snoozedUntil: loadSnooze(), hasData, now: Date.now() });

  // Açık durum türetilir: yedek alınınca (otomatik dahil) pencere kendiliğinden kapanır
  const open = shown && needsReminder({ lastAt: auto.lastAt, snoozedUntil: loadSnooze(), hasData, now: Date.now() });

  useEffect(() => {
    const check = () => {
      if (document.querySelector("dialog[open]")) return; // başka bir pencere açıksa üstüne binme, sonraki kontrole kalsın
      if (due()) setShown(true);
    };
    const first = setTimeout(check, FIRST_CHECK_MS);
    const id = setInterval(check, CHECK_MS);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [hasData]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (open && ref.current && !ref.current.open) ref.current.showModal(); }, [open]);

  const later = () => { snooze(); setShown(false); };
  const backupNow = async () => {
    setBusy(true);
    try {
      if ((await runManualBackup(t)) === "saved") { clearSnooze(); setShown(false); }
    } catch (e) {
      console.error(e);
      toast(t("d.bk.err.fail", { msg: e?.message || String(e) }), "error", 8000);
    } finally { setBusy(false); }
  };

  if (!open) return null;
  const a = auto.lastAt > 0 ? ago(auto.lastAt, Date.now()) : null;
  return (
    <dialog ref={ref} className="dialog dialog--confirm" aria-labelledby="bkr-title" aria-describedby="bkr-msg" onCancel={(e) => { e.preventDefault(); if (!busy) later(); }}>
      <div className="dialog-inner">
        <div className="dialog-head"><h2 id="bkr-title">{t("d.bkr.title")}</h2></div>
        <p id="bkr-msg" className="dialog-msg">
          {t("d.bkr.msg")}<br />
          <strong>{a ? t("d.bkr.last", { ago: t(a.unit === "h" ? "d.bkr.agoH" : "d.bkr.agoD", { n: a.n }) }) : t("d.bkr.never")}</strong>
        </p>
        <div className="dialog-foot">
          <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={later}>{t("d.bkr.later")}</button>
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={backupNow}>{busy ? t("d.bkr.busy") : t("d.bkr.now")}</button>
        </div>
      </div>
    </dialog>
  );
}
