import { ICONS } from "@common";
import { useT } from "../lib/i18n.js";
import { fmtUi } from "@engine/doc-model.js";

/** Proforma okuma özeti: hangi bilgiler bulundu, uyarılar. rec.parse = { name, chips, warnings, currency } */
export function ParseReport({ parse, onDismiss }) {
  const t = useT();
  if (!parse) return null;
  const cur = parse.currency || "";
  return (
    <div className="parse-result">
      <p className="pr-file">
        <span dangerouslySetInnerHTML={{ __html: ICONS.doc }} />
        <span>{t("pf.readDone", { file: parse.name })}</span>
        {onDismiss && <button type="button" className="btn btn--quiet btn--sm pr-dismiss" onClick={onDismiss}>{t("d.dismiss")}</button>}
      </p>
      <div className="pr-chips">
        {parse.chips.map((c, i) => (
          <span key={i} className={`chip ${c.ok ? "chip--ok" : "chip--warn"}`}>
            <span dangerouslySetInnerHTML={{ __html: c.ok ? ICONS.check : ICONS.warn }} />
            {t(c.key, c.vars)}
          </span>
        ))}
      </div>
      <ul className="pr-warnings">
        {parse.warnings.map((w, i) => {
          const vars = { ...(w.vars || {}) };
          for (const k of w.fmt || []) vars[k] = `${fmtUi(vars[k])} ${cur}`.trim();
          return (
            <li key={i} className={`lvl-${w.level || "info"}`}>
              <span dangerouslySetInnerHTML={{ __html: w.level === "ok" ? ICONS.check : w.level === "warn" ? ICONS.warn : ICONS.info }} />
              <span>{t(w.key, vars)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** parseProforma sonucundan, kayda yazılacak (çeviri anahtarı tutan) özet üretir */
export function buildParseSummary(name, res) {
  const chips = [];
  const chip = (key, ok, vars) => chips.push({ key, ok, vars });
  chip("chip.items", res.items.length > 0, { n: res.items.length });
  chip("chip.seller", !!res.seller?.name);
  chip("chip.buyer", !!res.buyer?.name);
  if (res.shipment.incoterm) chip("chip.incoterm", true, { v: [res.shipment.incoterm, res.shipment.incotermPlace].filter(Boolean).join(" ") });
  if (res.meta.currency) chip("chip.currency", true, { v: res.meta.currency });
  if (res.items.some((it) => it.hsCode)) chip("chip.hs", true);
  if (res.items.some((it) => it.netWeight != null || it.grossWeight != null) || res.packingTotals.net != null || res.packingTotals.gross != null) chip("chip.weights", true);
  if (res.bank.iban || res.bank.bankName) chip("chip.bank", true);
  return { name, chips, warnings: res.warnings, currency: res.meta.currency || "" };
}
