import { Fragment } from "react";
import schema from "../../lib/form-schema.json";
import { useT } from "../../lib/i18n.js";
import { SchemaField } from "./Field.jsx";
import { Parties } from "./Parties.jsx";
import { ItemsTable, DistBlock } from "./ItemsTable.jsx";
import { PalletsTable } from "./PalletsTable.jsx";
import { ChargeTotals } from "./Totals.jsx";

const SECTIONS = Object.fromEntries(schema.sections.map((s) => [s.letter, s]));

/** Ardışık, aynı ızgaraya ait düğümleri bir arada gruplar */
function group(nodes) {
  const out = [];
  for (const n of nodes) {
    const last = out[out.length - 1];
    if (n.grid != null && last && last.grid === n.grid) last.items.push(n);
    else out.push({ grid: n.grid, cols: n.cols, items: [n] });
  }
  return out;
}

function SchemaBody({ sec, ctx, extras = {}, only }) {
  const t = useT();
  const nodes0 = only ? sec.nodes.filter((n) => only.includes(n.bind || n.labelKey)) : sec.nodes;
  return group(nodes0).map((g, gi) => {
    const nodes = g.items.map((n, ni) => (
      n.kind === "sub"
        ? <div className="sub-head" key={ni}><span className="field-label">{t(n.labelKey)}</span>{n.hintKey && <span className="muted">{t(n.hintKey)}</span>}</div>
        : <SchemaField key={n.bind} node={n} ctx={ctx} />
    ));
    const after = g.items.map((n) => extras[n.bind]).filter(Boolean);
    return (
      <Fragment key={gi}>
        {g.grid != null ? <div className={`fgrid fgrid--${g.cols || 3}`}>{nodes}</div> : nodes}
        {after.map((el, i) => <Fragment key={i}>{el}</Fragment>)}
      </Fragment>
    );
  });
}

export function FormSection({ letter, ctx, only, titleKey }) {
  const t = useT();
  const sec = SECTIONS[letter];
  if (!sec) return null;
  let body;
  if (letter === "B") body = <Parties ctx={ctx} />;
  else if (letter === "D") body = <ItemsTable ctx={ctx} />;
  else if (letter === "O") body = <PalletsTable ctx={ctx} />;
  else {
    const extras = letter === "E" ? { "charges.vat": <ChargeTotals ctx={ctx} /> } : letter === "F" ? { "packing.totalVolume": <DistBlock ctx={ctx} /> } : {};
    body = <SchemaBody sec={sec} ctx={ctx} extras={extras} only={only} />;
  }
  const count = letter === "D" && ctx.state.items.length ? ` · ${ctx.state.items.length}` : "";
  return (
    <section className="fcard" id={`sec-${letter}`}>
      <header className="fcard-head"><h3 lang={titleKey ? "en" : undefined}>{t(titleKey || sec.titleKey)}<span className="fsec-count">{count}</span></h3></header>
      <div className="fsec-body">{body}</div>
    </section>
  );
}
