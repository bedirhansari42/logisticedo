import { useRef, useState, useSyncExternalStore } from "react";
import { toast } from "@common";
import { useT, useLang, setLang } from "../lib/i18n.js";
import { Icon, Spinner } from "../components/Icons.jsx";
import { validateBackup, planRestore } from "../backup/backup.mjs";
import { collectSnapshot, applyPlan } from "../backup/io.js";
import { runManualBackup } from "../backup/manual.js";
import { getAuto, saveAuto, subscribe, HOURS } from "../backup/auto.mjs";
import { runAutoBackup } from "../backup/scheduler.js";
import { useApp } from "../lib/app-context.jsx";
import { updateApi, checkForUpdate, canUseInstall, useAppVersion } from "../update/api.mjs";
import { isEnabled, setEnabled } from "../update/state.mjs";
import { tourEvent } from "../tour/store.mjs";
import { go } from "../lib/router.js";

export function Settings() {
  const t = useT();
  const lang = useLang();
  const { persistent, shipments, letterheads } = useApp();
  const [busy, setBusy] = useState(null); // "export" | "import"
  const fileRef = useRef(null);
  const auto = useSyncExternalStore(subscribe, getAuto);
  const api = typeof window !== "undefined" ? window.lgxBackup : null; // yalnızca masaüstü uygulamasında var
  const version = useAppVersion();
  const updApi = updateApi(); // yalnızca masaüstü uygulamasında var
  const [updOn, setUpdOn] = useState(isEnabled);
  const [upd, setUpd] = useState(null); // null | "checking" | { status, latest? }
  const toggleUpd = () => { setEnabled(!updOn); setUpdOn(!updOn); };
  const checkNow = async () => { setUpd("checking"); setUpd(await checkForUpdate({ manual: true })); };
  const when = (ms) => new Date(ms).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { dateStyle: "short", timeStyle: "short" });

  const pickFolder = async () => {
    try { const d = await api.chooseFolder(auto.dir); if (d) saveAuto({ dir: d, lastError: "" }); return d; }
    catch (e) { console.error(e); toast(t("d.bk.err.fail", { msg: e?.message || String(e) }), "error", 8000); return null; }
  };
  const toggleAuto = async () => {
    if (auto.enabled) { saveAuto({ enabled: false }); return; }
    if (!auto.dir && !(await pickFolder())) return; // otomatik yedek için önce klasör gerekir
    saveAuto({ enabled: true, lastError: "" });
    runAutoBackup(); // hiç yedek yoksa hemen ilkini alır
  };

  const doExport = async () => {
    setBusy("export");
    try {
      await runManualBackup(t);
    } catch (e) {
      console.error(e);
      toast(t("d.bk.err.fail", { msg: e?.message || String(e) }), "error", 8000);
    } finally { setBusy(null); }
  };

  const doImport = async (file) => {
    setBusy("import");
    try {
      let backup;
      try { backup = JSON.parse(await file.text()); } catch { toast(t("d.bk.err.format"), "error", 8000); return; }
      const v = validateBackup(backup);
      if (!v.ok) { toast(t(v.key), "error", 8000); return; }
      const date = new Date(backup.createdAt || 0).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB");
      if (!window.confirm(t("d.bk.confirm", { date, s: v.summary.shipments, p: v.summary.proformas, l: v.summary.letterheads, c: v.summary.companies, n: v.summary.notes }))) return;
      const plan = await planRestore(backup, await collectSnapshot());
      await applyPlan(plan);
      const sum = ["shipments", "proformas", "letterheads", "companies", "notes"].reduce((a, k) => ({ added: a.added + plan.counts[k].added, updated: a.updated + plan.counts[k].updated }), { added: 0, updated: 0 });
      toast(t("d.bk.done", sum), "ok");
      setTimeout(() => window.location.reload(), 900); // listeler, dil ve tema yeniden yüklensin
    } catch (e) {
      console.error(e);
      toast(e?.message === "storage" ? t("d.bk.err.storage") : t("d.bk.err.fail", { msg: e?.message || String(e) }), "error", 8000);
    } finally { setBusy(null); }
  };
  return (
    <div className="page page--narrow">
      <header className="page-head"><div><h1>{t("d.set.title")}</h1></div></header>
      <section className="card-block pad">
        <h2 className="block-title">{t("d.set.language")}</h2>
        <p className="muted">{t("d.set.languageText")}</p>
        <div className="segmented" role="group">
          <button type="button" aria-pressed={lang === "tr"} onClick={() => setLang("tr")}>Türkçe</button>
          <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>Englısh</button>
        </div>
      </section>
      <section className="card-block pad">
        <h2 className="block-title">{t("d.set.data")}</h2>
        <p className="muted">{t("d.set.dataText")}</p>
        <dl className="kv">
          <div><dt>{t("d.set.stored")}</dt><dd>{t("d.set.storedValue", { s: shipments.length, l: letterheads.length })}</dd></div>
          <div><dt>{t("d.set.storage")}</dt><dd>{persistent ? t("d.set.persistent") : t("lh.storageFail")}</dd></div>
        </dl>
      </section>
      <section className="card-block pad">
        <h2 className="block-title">{t("d.bk.title")}</h2>
        <p className="muted">{t("d.bk.text")}</p>
        <p className="warn-text">{t("d.bk.warn")}</p>
        {api && (
          <>
            <dl className="kv">
              <div><dt>{t("d.bk.folder")}</dt><dd className="bk-path">{auto.dir || t("d.bk.folderNone")}</dd></div>
              {auto.lastAt > 0 && <div><dt>{t("d.bk.last")}</dt><dd className="bk-path">{when(auto.lastAt)}{auto.lastFile ? ` · ${auto.lastFile.split(/[\\/]/).pop()}` : ""}</dd></div>}
            </dl>
            <div className="bk-auto">
              <button type="button" role="switch" aria-checked={auto.enabled} aria-label={t("d.bk.auto")} className="switch" onClick={toggleAuto} />
              <span>{t("d.bk.auto")}</span>
              <select className="select bk-hours" value={auto.hours} disabled={!auto.enabled} onChange={(e) => saveAuto({ hours: Number(e.target.value) })} aria-label={t("d.bk.auto")}>
                {HOURS.map((h) => <option key={h} value={h}>{t("d.bk.hours", { n: h })}</option>)}
              </select>
              <button type="button" className="btn btn--quiet btn--sm" onClick={pickFolder}>{auto.dir ? t("d.bk.folderChange") : t("d.bk.folderChoose")}</button>
            </div>
            <p className="muted pl-hint">{t("d.bk.autoNote")}</p>
            {auto.lastError && <p className="warn-text">{t("d.bk.autoErr", { msg: auto.lastError })}</p>}
          </>
        )}
        <div className="lc-downloads">
          <button type="button" className="btn btn--ghost btn--sm" onClick={doExport} disabled={!!busy}>{busy === "export" ? <><Spinner />{t("d.bk.busy")}</> : <><Icon name="download" />{t("d.bk.export")}</>}</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => fileRef.current?.click()} disabled={!!busy}>{busy === "import" ? <><Spinner />{t("d.bk.busy")}</> : <><Icon name="upload" />{t("d.bk.import")}</>}</button>
          <input ref={fileRef} className="visually-hidden" type="file" accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) doImport(f); }} />
        </div>
      </section>
      <section className="card-block pad">
        <h2 className="block-title">{t("d.set.tour")}</h2>
        <p className="muted">{t("d.set.tourText")}</p>
        <div className="lc-downloads">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => { go("/"); tourEvent("restart"); }}>{t("d.set.tourRestart")}</button>
        </div>
      </section>
      {updApi && (
        <section className="card-block pad">
          <h2 className="block-title">{t("d.set.updates")}</h2>
          <div className="bk-auto">
            <button type="button" role="switch" aria-checked={updOn} aria-label={t("d.set.updatesCheck")} className="switch" onClick={toggleUpd} />
            <span>{t("d.set.updatesCheck")}</span>
          </div>
          <p className="muted pl-hint">{t("d.set.updatesNote")}</p>
          <div className="lc-downloads">
            <button type="button" className="btn btn--ghost btn--sm" onClick={checkNow} disabled={upd === "checking"}>
              {upd === "checking" ? <><Spinner />{t("d.set.checking")}</> : t("d.set.checkNow")}
            </button>
          </div>
          {upd && upd !== "checking" && upd.status === "current" && <p className="muted">{t("d.set.upToDate")}</p>}
          {upd && upd !== "checking" && upd.status === "newer" && (
            <p>{t("d.set.newVersion", { v: `v${upd.latest.version}` })}{" "}
              <button type="button" className="btn btn--primary btn--sm" onClick={() => window.dispatchEvent(new CustomEvent("lgx:update:show", { detail: { version: upd.latest.version, url: upd.latest.url, current: upd.current } }))}>{canUseInstall() ? t("d.upd.install") : t("d.upd.download")}</button>
            </p>
          )}
          {upd && upd !== "checking" && upd.status === "error" && <p className="warn-text">{t(`d.set.checkFail.${upd.reason}`)}</p>}
        </section>
      )}
      <section className="card-block pad">
        <h2 className="block-title">{t("d.set.about")}</h2>
        <dl className="kv">
          <div><dt>{t("d.set.version")}</dt><dd>{version}</dd></div>
          <div><dt>{t("d.set.license")}</dt><dd>{t("d.set.licenseValue")}</dd></div>
        </dl>
      </section>
    </div>
  );
}
