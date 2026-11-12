import { useT } from "../../lib/i18n.js";
import { fmtUi } from "@engine/doc-model.js";

export function ItemTotals({ ctx }) {
  const t = useT();
  const { T, state } = ctx;
  const cur = (state.meta.currency || "").toUpperCase();
  const parts = [
    [t("it.subtotal"), `${fmtUi(T.subtotal)} ${cur}`, true],
    [t("it.totPkgs"), T.packages ? fmtUi(T.packages, 0) : "–"],
    [t("it.totNet"), T.net ? `${fmtUi(T.net)} kg` : "–"],
    [t("it.totGross"), T.gross ? `${fmtUi(T.gross)} kg` : "–"],
    [t("it.totVol"), T.volume ? `${fmtUi(T.volume, 3)} m³` : "–"]
  ];
  return (
    <dl className="totals-strip">
      {parts.map(([k, v, total]) => <div key={k} className={total ? "is-total" : undefined}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}

export function ChargeTotals({ ctx }) {
  const t = useT();
  const { T, state } = ctx;
  const cur = (state.meta.currency || "").toUpperCase();
  const lines = [[t("it.subtotal"), T.subtotal]];
  if (T.freight) lines.push([t("f.freight"), T.freight]);
  if (T.insurance) lines.push([t("f.insurance"), T.insurance]);
  if (T.other) lines.push([state.charges.otherLabel || t("f.other"), T.other]);
  if (T.discount) lines.push([t("f.discount"), -T.discount]);
  if (T.vat) lines.push([`${t("f.vatShort")}${T.vatRate ? ` (%${fmtUi(T.vatRate, 2).replace(/[.,]00$/, "")})` : ""}`, T.vat]);
  lines.push([t("it.total"), T.total, true]);
  return (
    <dl className="sum-box">
      {lines.map(([k, v, total]) => <div key={k} className={total ? "is-total" : undefined}><dt>{k}</dt><dd>{fmtUi(v)} {cur}</dd></div>)}
    </dl>
  );
}
