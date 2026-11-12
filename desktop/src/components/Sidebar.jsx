import { useT, useLang, setLang } from "../lib/i18n.js";
import { useApp } from "../lib/app-context.jsx";
import { Brand, Icon } from "./Icons.jsx";

const NAV = [
  ["dashboard", "/", "dashboard", "d.nav.dashboard"],
  ["shipments", "/shipments", "shipments", "d.nav.shipments"],
  ["planner", "/planner", "planner", "d.nav.planner"]
];
// "Şirket bilgileri" grubu
const COMPANY_NAV = [
  ["companies", "/companies", "company", "d.nav.companies"],
  ["banks", "/banks", "bank", "d.nav.banks"],
  ["letterheads", "/letterheads", "letterhead", "d.nav.letterheads"]
];

export function Sidebar({ route }) {
  const t = useT();
  const lang = useLang();
  const { shipments } = useApp();
  const active = route.name === "editor" ? "shipments" : route.name;
  return (
    <aside className="side">
      <div className="side-top"><Brand /></div>
      <nav className="side-nav" aria-label="Menu">
        {NAV.map(([key, path, icon, label]) => (
          <a key={key} href={`#${path}`} className={active === key ? "is-active" : ""} aria-current={active === key ? "page" : undefined} title={t(label)}>
            <Icon name={icon} /><span className="side-label">{t(label)}</span>
            {key === "shipments" && shipments.length > 0 && <em className="side-count">{shipments.length}</em>}
          </a>
        ))}
        <p className="side-group side-label">{t("d.nav.company")}</p>
        {COMPANY_NAV.map(([key, path, icon, label]) => (
          <a key={key} href={`#${path}`} className={active === key ? "is-active" : ""} aria-current={active === key ? "page" : undefined} title={t(label)}>
            <Icon name={icon} /><span className="side-label">{t(label)}</span>
          </a>
        ))}
      </nav>
      <div className="side-bottom">
        <a href="#/settings" className={`side-link${route.name === "settings" ? " is-active" : ""}`} title={t("d.nav.settings")}>
          <Icon name="settings" /><span className="side-label">{t("d.nav.settings")}</span>
        </a>
        <div className="lang-switch side-lang" role="group" aria-label="Dil / Language">
          <button type="button" aria-pressed={lang === "tr"} onClick={() => setLang("tr")}>TR</button>
          <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
        </div>
        <p className="side-local side-label"><Icon name="shield" />{t("d.nav.local")}</p>
      </div>
    </aside>
  );
}
