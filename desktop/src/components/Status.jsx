import { useT, useLang } from "../lib/i18n.js";

export function StatusPill({ status }) {
  const t = useT();
  return <span className={`status status--${status}`}><i />{t(`d.status.${status}`)}</span>;
}

export function relTime(ts, t, lang) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return t("d.time.now");
  if (min < 60) return t("d.time.min", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("d.time.hour", { n: h });
  const d = Math.floor(h / 24);
  if (d < 7) return t("d.time.day", { n: d });
  return new Date(ts).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function useMoney() {
  const lang = useLang();
  const nf = new Intl.NumberFormat(lang === "tr" ? "tr-TR" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n, cur) => (n ? `${nf.format(n)} ${cur || ""}`.trim() : "—");
}
