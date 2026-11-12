import { useLayoutEffect, useRef } from "react";
import { useT } from "../../lib/i18n.js";
import { getPath } from "../../lib/shipment-state.js";
import { INCOTERMS, TRANSPORT_MODES } from "@engine/doc-model.js";
import { ListInput } from "./ListInput.jsx";

// (çeviri anahtarı denetimi tırnaklı "a.b" yazılarını anahtar sanır; bu yüzden parçalı yazıldı)
const COUNTRY_BINDS = new Set([["shipment", "countryOrigin"], ["shipment", "countryDestination"], ["poa", "country"]].map((p) => p.join(".")));

export const NUM_FILTER = /[^\d.,\-]/g;
const UPPER = new Set(["meta.currency", "packing.packageType"]);
const HIDDEN = {
  "sign.declaration": (s) => !s.sign.showDeclaration,
  "options.paper": (s, ctx) => !!ctx.lh
};

/** Değeri state'e yazar; proformadan gelen işareti kaldırır; KDV oranı tüm kalemlere uygulanır. */
export function setField(ctx, bind, v) {
  ctx.update((d, auto) => {
    const ks = bind.split(".");
    let cur = d;
    for (let i = 0; i < ks.length - 1; i++) cur = cur[ks[i]];
    cur[ks[ks.length - 1]] = v;
    auto.delete(bind);
    if (bind === "charges.vatRate") for (const it of d.items) { it.vatRate = v; auto.delete(`item:${it.id}:vatRate`); }
  });
}

/** İçeriğe göre yüksekliği ayarlanan textarea (tablo hücreleri) */
export function AutoArea({ value, className, ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(36, el.scrollHeight + 2)}px`;
  }, [value]);
  return <textarea ref={ref} rows={1} value={value} className={className} {...rest} />;
}

const spanCls = (n) => (n === 3 ? " span-3" : n === 2 ? " span-2" : "");

/** Şema düğümünden (form-schema.json) alan çizer */
export function SchemaField({ node, ctx }) {
  const t = useT();
  const { state, auto } = ctx;
  if (HIDDEN[node.bind]?.(state, ctx)) return null;
  const v = getPath(state, node.bind);
  const id = `f_${node.bind.replace(/\./g, "_")}`;

  if (node.kind === "check") {
    return (
      <label className={`check${spanCls(node.span)}`}>
        <input type="checkbox" checked={!!v} onChange={(e) => setField(ctx, node.bind, e.target.checked)} />
        <span>{node.labelKey ? t(node.labelKey) : node.labelText}</span>
      </label>
    );
  }

  const label = node.labelKey ? t(node.labelKey) : node.labelText;
  const dim = node.bind.startsWith("bank.") && node.bind !== "bank.show" && !state.bank.show;
  const isAuto = auto.has(node.bind);
  const cls = (base) => `${base}${isAuto ? " is-auto" : ""}${node.mono ? " mono-num" : ""}`;

  let ph = node.placeholderKey ? t(node.placeholderKey) : node.placeholder;
  const dyn = ctx.placeholders?.[node.bind];
  if (dyn) ph = dyn;

  let control;
  if (node.control === "select") {
    let opts;
    if (node.bind === "shipment.incoterm") opts = [["", t("f.none")], ...INCOTERMS.map((c) => [c, c])];
    else if (node.bind === "shipment.transportMode") {
      opts = [["", t("f.none")], ...TRANSPORT_MODES.map(([val, k]) => [val, `${t(k)} · ${val}`])];
      if (v && !TRANSPORT_MODES.some(([val]) => val === v)) opts.push([v, v]);
    } else opts = node.options.map((o) => [o.value, o.labelKey ? t(o.labelKey) : o.text, o.en]);
    control = (
      <select id={id} className={cls("select")} value={v ?? ""} onChange={(e) => setField(ctx, node.bind, e.target.value)}>
        {opts.map(([val, text, en]) => <option key={val} value={val} lang={en ? "en" : undefined}>{text}</option>)}
      </select>
    );
  } else if (node.control === "textarea") {
    control = <textarea id={id} className={cls("textarea")} rows={Number(node.rows) || 3} value={v ?? ""} placeholder={ph} onChange={(e) => setField(ctx, node.bind, e.target.value)} />;
  } else {
    const numeric = node.inputmode === "decimal";
    const onChange = (e) => {
      const el = e.target;
      let val = el.value;
      if (numeric) val = val.replace(NUM_FILTER, "");
      if (UPPER.has(node.bind)) {
        const up = val.toUpperCase();
        if (up !== val) { const pos = el.selectionStart; val = up; requestAnimationFrame(() => { try { el.setSelectionRange(pos, pos); } catch { /* yoksay */ } }); }
      }
      setField(ctx, node.bind, val);
    };
    control = (
      <ListInput
        id={id} className={cls("input")} type={node.type === "date" ? "date" : "text"} value={v ?? ""} placeholder={COUNTRY_BINDS.has(node.bind) ? undefined : ph}
        inputMode={node.inputmode} list={COUNTRY_BINDS.has(node.bind) ? "dl-country" : node.list} maxLength={node.maxlength ? Number(node.maxlength) : undefined}
        autoCapitalize={node.autocapitalize} spellCheck={node.mono ? false : undefined}
        onChange={onChange}
      />
    );
  }

  return (
    <div className={`field${spanCls(node.span)}${dim ? " is-off" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {control}
      {node.hintKey && <p className="muted">{t(node.hintKey)}</p>}
    </div>
  );
}

/** Elle yazılan (şemada olmayan) bağlı alan: taraf bilgileri */
export function PlainField({ ctx, bind, labelKey, textarea = false, rows = 3 }) {
  const t = useT();
  const v = getPath(ctx.state, bind);
  const id = `f_${bind.replace(/\./g, "_")}`;
  const cls = `${textarea ? "textarea" : "input"}${ctx.auto.has(bind) ? " is-auto" : ""}`;
  const onChange = (e) => setField(ctx, bind, e.target.value);
  return (
    <div className="field">
      <label htmlFor={id}>{t(labelKey)}</label>
      {textarea ? <textarea id={id} className={cls} rows={rows} value={v ?? ""} onChange={onChange} /> : <input id={id} className={cls} value={v ?? ""} onChange={onChange} />}
    </div>
  );
}
