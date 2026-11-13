import { useT, useLang } from "../../lib/i18n.js";

const COLS = ["goods", "freight", "insurance", "cif", "duty", "emy", "kkdf", "other", "otv", "vat", "local", "landed"];

/** calcLanded sonucu: özet kartları, kalem tablosu, uyarılar. */
export function ResultView({ result, input }) {
  const t = useT();
  const lang = useLang();
  const fmt = (n, dp = 2) => Number(n).toLocaleString(lang === "tr" ? "tr-TR" : "en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const T = result.totals;
  const tv = (w) => t(w.key, w.key === "d.lc.warn.autoPartial" ? { ...w.vars, key: t(`d.lc.alloc.${w.vars.key}`) } : w.vars);
  const shared = result.costs.filter((c) => c.applied && c.usedKey);
  return (
    <div className="lc-result">
      <div className="stats lc-stats">
        <div className="stat"><span className="stat-k">{t("d.lc.sum.cash")}</span><span className="stat-v">{fmt(T.cash)}</span><span className="stat-s">{t("d.lc.sum.cashSub")}</span></div>
        <div className="stat"><span className="stat-k">{t("d.lc.sum.recoverable")}</span><span className="stat-v">{fmt(T.recoverableVat)}</span><span className="stat-s">TRY</span></div>
        <div className="stat"><span className="stat-k">{t(input.vatDeductible ? "d.lc.sum.landed" : "d.lc.sum.landedVat")}</span><span className="stat-v">{fmt(T.landed)}</span><span className="stat-s">TRY</span></div>
        <div className="stat"><span className="stat-k">{t("d.lc.sum.cif")}</span><span className="stat-v">{fmt(T.cif)}</span><span className="stat-s">TRY</span></div>
      </div>
      {result.flatInsurance.applied && <p className="muted pl-hint">{t("d.lc.flatNote", { base: fmt(result.flatInsurance.base), amount: fmt(result.flatInsurance.amountTry) })}</p>}
      {shared.length > 0 && <p className="muted pl-hint">{shared.map((c) => t("d.lc.allocUsed", { label: c.label, key: t(`d.lc.alloc.${c.usedKey}`) })).join(" · ")}</p>}
      {result.warnings.map((w, i) => <p key={i} className="warn-text pl-hint">{tv(w)}</p>)}
      <div className="table-wrap">
        <table className="tbl tbl--static">
          <thead>
            <tr>
              <th>{t("d.lc.col.name")}</th><th className="num">{t("d.lc.col.qty")}</th>
              {COLS.map((c) => <th key={c} className="num">{t(`d.lc.tbl.${c}`)}</th>)}
              <th className="num">{t("d.lc.tbl.unit")}</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((it) => (
              <tr key={it.id}>
                <td>{it.name}</td><td className="num">{fmt(it.qty, Number.isInteger(it.qty) ? 0 : 2)}</td>
                {COLS.map((c) => <td key={c} className="num">{fmt(it[c])}</td>)}
                <td className="num">{fmt(it.unitCost, 4)}</td>
              </tr>
            ))}
            <tr className="lc-total">
              <td>{t("d.lc.tbl.total")}</td><td />
              {COLS.map((c) => <td key={c} className="num">{fmt(T[c])}</td>)}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
