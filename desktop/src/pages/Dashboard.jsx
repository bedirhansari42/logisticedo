import { useMemo } from "react";
import { useT, useLang } from "../lib/i18n.js";
import { useApp } from "../lib/app-context.jsx";
import { go, href } from "../lib/router.js";
import { shipmentTitle } from "../lib/shipment-state.js";
import { ShipmentTable } from "../components/ShipmentTable.jsx";
import { Icon } from "../components/Icons.jsx";

const monthKey = (ts) => { const d = new Date(ts); return d.getFullYear() * 12 + d.getMonth(); };

function Chart({ data }) {
  const t = useT();
  const max = Math.max(1, ...data.map((d) => d.n));
  const W = 300, H = 120, pad = 22, bw = 28, gap = (W - bw * data.length) / (data.length + 1);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("d.dash.activity")}>
      <line x1="0" x2={W} y1={H - pad} y2={H - pad} stroke="var(--line-strong)" />
      {data.map((d, i) => {
        const h = Math.max(d.n ? 4 : 0, ((H - pad - 18) * d.n) / max);
        const x = gap + i * (bw + gap);
        const last = i === data.length - 1;
        return (
          <g key={d.label}>
            <rect x={x} y={H - pad - h} width={bw} height={h} rx="5" fill={last ? "var(--green)" : "var(--surface-3)"}><title>{`${d.label}: ${d.n}`}</title></rect>
            {d.n > 0 && <text x={x + bw / 2} y={H - pad - h - 6} textAnchor="middle" fontSize="11" fill="var(--text-2)">{d.n}</text>}
            <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize="10.5" fill="var(--text-4)">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function Dashboard() {
  const t = useT();
  const lang = useLang();
  const { shipments, letterheads, ready } = useApp();
  const locale = lang === "tr" ? "tr-TR" : "en-US";

  const stats = useMemo(() => {
    const now = new Date();
    const cur = monthKey(now.getTime());
    const count = (s) => shipments.filter((x) => x.status === s).length;
    const month = shipments.filter((x) => monthKey(x.createdAt) === cur);
    const byCur = {};
    for (const x of month) { const c = x.summary?.currency || ""; byCur[c] = (byCur[c] || 0) + (x.summary?.total || 0); }
    const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    const value = Object.entries(byCur).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c, v]) => `${nf.format(v)} ${c}`.trim());
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { key: monthKey(d.getTime()), label: new Intl.DateTimeFormat(locale, { month: "short" }).format(d), n: 0 };
    });
    for (const x of shipments) { const m = months.find((mm) => mm.key === monthKey(x.createdAt)); if (m) m.n++; }
    const foc = shipments.filter((x) => x.summary?.foc ?? x.state?.foc?.enabled).length; // ücretsiz (Free of Charge) sevkiyat sayısı
    return { total: shipments.length, foc, active: count("draft") + count("ready"), transit: count("transit"), month: month.length, value, months };
  }, [shipments, locale]);

  const attention = shipments.filter((x) => (x.status === "draft" || x.status === "ready") && x.summary?.missing?.length).slice(0, 5);

  if (!ready) return null;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{t("d.dash.title")}</h1>
          <p className="muted date">{new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <a className="btn btn--primary" href="#/new"><Icon name="plus" />{t("d.nav.new")}</a>
      </header>

      {letterheads.length === 0 && (
        <div className="banner">
          <Icon name="warn" />
          <span>{t("d.dash.noLh")}</span>
          <a className="btn btn--ghost btn--sm" href="#/letterheads">{t("d.dash.addLh")}</a>
        </div>
      )}

      {shipments.length === 0 ? (
        <div className="empty-state">
          <div className="empty-art" aria-hidden="true"><Icon name="shipments" /></div>
          <h2>{t("d.empty.title")}</h2>
          <p>{t("d.empty.text")}</p>
          <a className="btn btn--primary btn--lg" href="#/new">{t("d.empty.cta")}</a>
        </div>
      ) : (
        <>
          <section className="stats" aria-label={t("d.dash.title")}>
            <div className="stat"><span className="stat-k">{t("d.stat.total")}</span><strong className="stat-v">{stats.total}</strong></div>
            <div className="stat"><span className="stat-k">{t("d.stat.active")}</span><strong className="stat-v">{stats.active}</strong><span className="stat-s">{t("d.stat.activeSub")}</span></div>
            <div className="stat"><span className="stat-k">{t("d.stat.transit")}</span><strong className="stat-v">{stats.transit}</strong></div>
            <div className="stat"><span className="stat-k">{t("d.stat.foc")}</span><strong className="stat-v">{stats.foc}</strong></div>
            <div className="stat"><span className="stat-k">{t("d.stat.month")}</span><strong className="stat-v">{stats.month}</strong>{stats.value.length > 0 && <span className="stat-s">{stats.value.join(" · ")}</span>}</div>
          </section>

          <div className="dash-grid">
            <section className="card-block">
              <header className="block-head">
                <h2>{t("d.dash.recent")}</h2>
                <a className="link" href="#/shipments">{t("d.dash.viewAll")}<Icon name="chevron" /></a>
              </header>
              <ShipmentTable rows={shipments.slice(0, 6)} compact />
            </section>
            <div className="dash-side">
              <section className="card-block">
                <header className="block-head"><h2>{t("d.dash.attention")}</h2></header>
                {attention.length === 0 ? <p className="muted block-empty">{t("d.dash.attentionEmpty")}</p> : (
                  <ul className="attn">
                    {attention.map((x) => (
                      <li key={x.id}>
                        <a href={href(`/s/${x.id}`)} onClick={(e) => { e.preventDefault(); go(`/s/${x.id}`); }}>
                          <strong>{shipmentTitle(x) || t("d.untitled")}</strong>
                          <span>{t("pv.missing", { list: x.summary.missing.map((k) => t(k)).join(", ") })}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="card-block">
                <header className="block-head"><h2>{t("d.dash.activity")}</h2></header>
                <Chart data={stats.months} />
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
