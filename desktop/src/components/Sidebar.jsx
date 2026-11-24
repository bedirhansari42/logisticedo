import { useT, useLang, setLang } from "../lib/i18n.js";
import { useApp } from "../lib/app-context.jsx";
import { useTheme, toggleTheme } from "../lib/theme.js";
import { Brand, Icon } from "./Icons.jsx";
import { SOCIAL, CREDIT } from "../lib/social.js";

const NAV = [
  ["dashboard", "/", "dashboard", "d.nav.dashboard"],
  ["proformas", "/proformas", "proforma", "d.nav.proformas"],
  ["shipments", "/shipments", "shipments", "d.nav.shipments"],
  ["planner", "/planner", "planner", "d.nav.planner"],
  ["landed", "/landed", "landed", "d.nav.landed"],
  ["notes", "/notes", "notes", "d.nav.notes"]
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
  const { shipments, proformas } = useApp();
  const theme = useTheme();
  const themeLabel = theme === "dark" ? t("d.nav.themeLight") : t("d.nav.themeDark");
  const active = route.name === "editor" ? "shipments" : route.name === "proformaEditor" ? "proformas" : route.name;
  return (
    <aside className="side">
      <div className="side-top"><Brand /></div>
      <nav className="side-nav" aria-label="Menu">
        {NAV.map(([key, path, icon, label]) => (
          <a key={key} href={`#${path}`} className={active === key ? "is-active" : ""} aria-current={active === key ? "page" : undefined} title={t(label)}>
            <Icon name={icon} /><span className="side-label">{t(label)}</span>
            {key === "shipments" && shipments.length > 0 && <em className="side-count">{shipments.length}</em>}
            {key === "proformas" && proformas.length > 0 && <em className="side-count">{proformas.length}</em>}
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
        <div className="side-credit-wrap">
          <p className="side-credit side-label">{CREDIT}</p>
          <nav className="side-social" aria-label="Social">
            {SOCIAL.filter((x) => /^https?:\/\//i.test(x.url)).map((x) => (
              <a key={x.key} href={x.url} target="_blank" rel="noopener noreferrer" title={x.label} aria-label={x.label}><Icon name={x.key} /></a>
            ))}
          </nav>
        </div>
        <button type="button" className="side-link side-theme" onClick={toggleTheme} title={themeLabel} aria-label={themeLabel}>
          <Icon name={theme === "dark" ? "sun" : "moon"} /><span className="side-label">{themeLabel}</span>
        </button>
        <a href="#/settings" className={`side-link${route.name === "settings" ? " is-active" : ""}`} title={t("d.nav.settings")}>
          <Icon name="settings" /><span className="side-label">{t("d.nav.settings")}</span>
        </a>
        <div className="lang-switch side-lang" role="group" aria-label="Dil / Language">
          <button type="button" data-lang="tr" aria-pressed={lang === "tr"} onClick={() => setLang("tr")}>TR</button>
          <button type="button" data-lang="en" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
        </div>
        <p className="side-local side-label"><Icon name="shield" />{t("d.nav.local")}</p>
      </div>
    </aside>
  );
}
