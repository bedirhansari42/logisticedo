import { useT, useLang, setLang } from "../lib/i18n.js";
import { useApp } from "../lib/app-context.jsx";

export function Settings() {
  const t = useT();
  const lang = useLang();
  const { persistent, shipments, letterheads } = useApp();
  return (
    <div className="page page--narrow">
      <header className="page-head"><div><h1>{t("d.set.title")}</h1></div></header>
      <section className="card-block pad">
        <h2 className="block-title">{t("d.set.language")}</h2>
        <p className="muted">{t("d.set.languageText")}</p>
        <div className="segmented" role="group">
          <button type="button" aria-pressed={lang === "tr"} onClick={() => setLang("tr")}>Türkçe</button>
          <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>English</button>
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
        <h2 className="block-title">{t("d.set.about")}</h2>
        <dl className="kv">
          <div><dt>{t("d.set.version")}</dt><dd>{__APP_VERSION__}</dd></div>
          <div><dt>{t("d.set.license")}</dt><dd>{t("d.set.licenseValue")}</dd></div>
        </dl>
      </section>
    </div>
  );
}
