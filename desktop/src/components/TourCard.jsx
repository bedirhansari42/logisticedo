import { useEffect, useRef } from "react";
import { useT } from "../lib/i18n.js";
import { useApp } from "../lib/app-context.jsx";
import { go } from "../lib/router.js";
import { tourEvent } from "../tour/store.mjs";
import { SETUP_STEPS, PAGE_STEPS, setupStatus, setupRoute, pageRoute } from "../tour/model.mjs";
import { Icon } from "./Icons.jsx";

/** Sağ altta duran rehber kartı. Modal DEĞİL: kullanıcı kart açıkken sayfada gezebilir ve veri ekleyebilir.
    Kurulum adımlarının işareti her çizimde verilerden türetilir (ayrı durum yok). */
export function TourCard({ state }) {
  const t = useT();
  const ref = useRef(null);
  const { letterheads, companies } = useApp();
  // Karta geçildiğinde (ilk açılış ve kurulum → sayfalar geçişi) odak karta taşınır: klavye ve ekran okuyucu kullanıcısı kartı kaybetmez
  useEffect(() => { ref.current?.focus(); }, [state.status]);
  // Kart açıkken sayfa sonları kartın altında kalmasın (dash.css: .tour-open .page)
  useEffect(() => {
    document.body.classList.add("tour-open");
    return () => document.body.classList.remove("tour-open");
  }, []);
  const banks = companies.reduce((n, c) => n + (c.banks?.length || 0), 0);
  const st = setupStatus({ letterheads: letterheads.length, companies: companies.length, banks });
  const close = (
    <button type="button" className="icon-btn icon-btn--plain" onClick={() => tourEvent("close")} aria-label={t("d.tour.close")} title={t("d.tour.close")}><Icon name="close" /></button>
  );

  if (state.status === "setup") {
    return (
      <aside key="setup" ref={ref} tabIndex={-1} className="tour-card" role="complementary" aria-label={t("d.tour.cardSetup")}>
        <div className="tour-head"><h2>{t("d.tour.cardSetup")}</h2>{close}</div>
        <ul className="tour-list">
          {SETUP_STEPS.map((id) => (
            <li key={id} className={st[id] ? "is-done" : ""}>
              <span className="tour-mark" aria-hidden="true">{st[id] ? "✓" : "○"}</span>
              <div className="tour-step"><b>{t(`d.tour.step.${id}`)}</b><small>{t(`d.tour.step.${id}Hint`)}</small></div>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => go(setupRoute(id, { companies: companies.length }))}>{t("d.tour.open")}</button>
            </li>
          ))}
        </ul>
        {st.complete && <p className="tour-msg">{t("d.tour.allSet")}</p>}
        <div className="tour-foot">
          <button type="button" className="btn btn--quiet btn--sm" onClick={() => tourEvent("skipSetup")}>{t("d.tour.skip")}</button>
          {st.complete && <button type="button" className="btn btn--primary btn--sm" onClick={() => tourEvent("finishSetup")}>{t("d.tour.continue")}</button>}
        </div>
      </aside>
    );
  }

  const id = PAGE_STEPS[state.page];
  const last = state.page >= PAGE_STEPS.length - 1;
  return (
    <aside key="pages" ref={ref} tabIndex={-1} className="tour-card" role="complementary" aria-label={t(`d.tour.page.${id}.title`)}>
      <div className="tour-head">
        <span className="tour-count">{t("d.tour.counter", { n: state.page + 1, total: PAGE_STEPS.length })}</span>
        {close}
      </div>
      <h2>{t(`d.tour.page.${id}.title`)}</h2>
      <p className="tour-msg">{t(`d.tour.page.${id}.text`)}</p>
      <div className="tour-foot">
        <button type="button" className="btn btn--quiet btn--sm" onClick={() => tourEvent("back")} disabled={state.page === 0}>{t("d.tour.back")}</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => go(pageRoute(id))}>{t("d.tour.goPage")}</button>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => tourEvent("next")}>{last ? t("d.tour.finish") : t("d.tour.next")}</button>
      </div>
    </aside>
  );
}
