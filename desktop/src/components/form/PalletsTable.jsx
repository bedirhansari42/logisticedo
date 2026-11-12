import { useEffect, useRef } from "react";
import { toast, ICONS } from "@common";
import { useT } from "../../lib/i18n.js";
import { newPallet, palletsFromItems } from "@engine/doc-model.js";
import { AutoArea, NUM_FILTER } from "./Field.jsx";
import { Icon } from "../Icons.jsx";
import { ListInput } from "./ListInput.jsx";

const COLS = [
  ["no", "pal.no", "text", "w-pno"],
  ["type", "pal.type", "text", "w-ptype2", "dl-pkg"],
  ["contents", "pal.contents", "area", "w-desc"],
  ["dimensions", "pal.dims", "text", "w-dims"],
  ["net", "pal.net", "num", "w-num"],
  ["gross", "pal.gross", "num", "w-num"]
];

export function PalletsTable({ ctx }) {
  const t = useT();
  const { state, update } = ctx;
  const pal = state.pallets;
  const focusLast = useRef(false);

  useEffect(() => {
    if (!focusLast.current) return;
    focusLast.current = false;
    const rows = document.querySelectorAll("#palletTable tbody tr[data-id]");
    rows[rows.length - 1]?.querySelector("textarea, input")?.focus();
  });

  const onPal = (id, f, raw) => update((d) => {
    const p = d.pallets.find((x) => x.id === id);
    if (!p) return;
    p[f] = f === "net" || f === "gross" ? raw.replace(NUM_FILTER, "") : raw;
  });
  const add = () => { focusLast.current = true; update((d) => { d.pallets.push(newPallet({ no: String(d.pallets.length + 1), type: (d.packing.packageType || "PALLET").replace(/S$/, "") })); }); };
  const remove = (id) => update((d) => { d.pallets = d.pallets.filter((x) => x.id !== id); });
  const fill = () => {
    if (!state.items.some((it) => it.description || it.qty)) { toast(t("pal.noItems"), "warn"); return; }
    if (pal.length && !window.confirm(t("pal.confirmFill"))) return;
    update((d) => { palletsFromItems(d); });
  };

  return (
    <>
      <p className="muted">{t("pal.hint")}</p>
      <div className="items-bar">
        <span className="muted">{pal.length ? t("pal.count", { n: pal.length }) : ""}</span>
        <div className="dist-actions">
          <button className="btn btn--ghost btn--sm" type="button" onClick={fill}>{t("pal.fill")}</button>
          <button className="btn btn--ghost btn--sm" type="button" onClick={add}><Icon name="plus" /><span>{t("pal.add")}</span></button>
        </div>
      </div>
      <div className="items-wrap">
        <table className="items" id="palletTable">
          <thead>
            <tr>
              {COLS.map(([f, key, , cls]) => <th key={f} className={cls}>{t(key)}</th>)}
              <th className="it-act" />
            </tr>
          </thead>
          <tbody>
            {!pal.length && <tr className="it-empty"><td colSpan={COLS.length + 1}>{t("pal.empty")}</td></tr>}
            {pal.map((p, i) => (
              <tr key={p.id} data-id={p.id}>
                {COLS.map(([f, key, type, cls, list]) => (
                  <td key={f} className={cls}>
                    {type === "area"
                      ? <AutoArea value={p[f] ?? ""} onChange={(e) => onPal(p.id, f, e.target.value)} aria-label={`${t(key)} ${i + 1}`} />
                      : <ListInput type="text" value={p[f] ?? ""} list={list} className={type === "num" ? "num" : undefined} inputMode={type === "num" ? "decimal" : undefined} placeholder={f === "no" ? String(i + 1) : undefined} onChange={(e) => onPal(p.id, f, e.target.value)} aria-label={`${t(key)} ${i + 1}`} />}
                  </td>
                ))}
                <td className="it-act">
                  <button type="button" className="icon-btn icon-btn--plain icon-btn--danger" title={t("pal.remove")} aria-label={t("pal.remove")} onClick={() => remove(p.id)} dangerouslySetInnerHTML={{ __html: ICONS.trash }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
