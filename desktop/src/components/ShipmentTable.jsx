import { ICONS } from "@common";
import { useT, useLang } from "../lib/i18n.js";
import { go } from "../lib/router.js";
import { shipmentTitle } from "../lib/shipment-state.js";
import { StatusPill, relTime, useMoney } from "./Status.jsx";

/** Sevkiyat tablosu. actions=true ise satır sonunda kopyala/sil düğmeleri çıkar. */
export function ShipmentTable({ rows, onDuplicate, onDelete, compact = false }) {
  const t = useT();
  const lang = useLang();
  const money = useMoney();
  const actions = !!(onDuplicate || onDelete);
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>{t("d.col.no")}</th>
            <th>{t("d.col.buyer")}</th>
            {!compact && <th>{t("d.col.route")}</th>}
            <th className="num">{t("d.col.total")}</th>
            <th>{t("d.col.status")}</th>
            {!compact && <th>{t("d.col.updated")}</th>}
            {actions && <th className="it-act" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = r.summary || {};
            const open = () => go(`/s/${r.id}`);
            return (
              <tr key={r.id} tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.key === "Enter") open(); }}>
                <td className="clip"><strong>{shipmentTitle(r) || t("d.untitled")}</strong>{s.foc && <span className="foc-badge">{t("d.foc.badge")}</span>}{s.proformaNo && <span className="sub">{s.proformaNo}</span>}</td>
                <td className="clip" title={s.buyer || undefined}>{s.buyer || "—"}</td>
                {!compact && <td className="clip">{s.from || s.to ? `${s.from || "?"} → ${s.to || "?"}` : "—"}{s.incoterm && <span className="sub">{s.incoterm}</span>}</td>}
                <td className="num">{money(s.total, s.currency)}</td>
                <td><StatusPill status={r.status} /></td>
                {!compact && <td className="muted">{relTime(r.updatedAt, t, lang)}</td>}
                {actions && (
                  <td className="it-act" onClick={(e) => e.stopPropagation()}>
                    {onDuplicate && <button type="button" className="icon-btn icon-btn--plain" title={t("d.act.dup")} aria-label={t("d.act.dup")} onClick={() => onDuplicate(r)} dangerouslySetInnerHTML={{ __html: ICONS.copy }} />}
                    {onDelete && <button type="button" className="icon-btn icon-btn--plain icon-btn--danger" title={t("d.act.del")} aria-label={t("d.act.del")} onClick={() => onDelete(r)} dangerouslySetInnerHTML={{ __html: ICONS.trash }} />}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
