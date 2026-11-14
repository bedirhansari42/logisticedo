import { useMemo, useState } from "react";
import { useT } from "../lib/i18n.js";
import { useApp } from "../lib/app-context.jsx";
import { proformaTitle } from "../lib/proforma-records.js";
import { useMoney } from "./Status.jsx";
import { Icon } from "./Icons.jsx";

/** Yeni sevkiyatta proforma seçici: tüm proformalar, arama ile; seçilen proforma onPick'e verilir. */
export function ProformaPicker({ onPick }) {
  const t = useT();
  const money = useMoney();
  const { proformas, shipments } = useApp();
  const [q, setQ] = useState("");

  const used = useMemo(() => {
    const m = new Map();
    for (const s of shipments) if (s.proformaId) m.set(s.proformaId, (m.get(s.proformaId) || 0) + 1);
    return m;
  }, [shipments]);

  const rows = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase();
    if (!needle) return proformas;
    return proformas.filter((r) => [r.summary?.proformaNo, r.summary?.buyer, r.summary?.seller].some((v) => String(v || "").toLocaleLowerCase().includes(needle)));
  }, [proformas, q]);

  if (!proformas.length) {
    return <p className="muted">{t("d.pf.pick.empty")} <a className="link" href="#/proformas">{t("d.nav.proformas")}</a></p>;
  }
  return (
    <>
      <label className="search">
        <Icon name="search" />
        <input className="input" type="search" placeholder={t("d.pf.search")} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="table-wrap">
        <table className="tbl">
          <tbody>
            {rows.map((r) => {
              const s = r.summary || {};
              const n = used.get(r.id) || 0;
              return (
                <tr key={r.id}>
                  <td className="clip"><strong>{proformaTitle(r) || t("d.pf.untitled")}</strong>{n > 0 && <span className="sub">{t("d.pf.shipCount", { n })}</span>}</td>
                  <td className="clip" title={s.buyer || undefined}>{s.buyer || "—"}</td>
                  <td className="num">{money(s.total, s.currency)}</td>
                  <td className="it-act"><button type="button" className="btn btn--ghost btn--sm" onClick={() => onPick(r)}>{t("d.pf.pick.go")}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
