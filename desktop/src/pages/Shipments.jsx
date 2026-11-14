import { useMemo, useState } from "react";
import { toast } from "@common";
import { useT } from "../lib/i18n.js";
import { askConfirm } from "../lib/confirm.js";
import { useApp } from "../lib/app-context.jsx";
import { STATUSES, duplicateRecord } from "../lib/shipment-state.js";
import { ShipmentTable } from "../components/ShipmentTable.jsx";
import { Icon } from "../components/Icons.jsx";

export function Shipments() {
  const t = useT();
  const { shipments, saveShipment, deleteShipment, ready } = useApp();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  const rows = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase();
    return shipments.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (!needle) return true;
      const s = r.summary || {};
      return [s.invoiceNo, s.proformaNo, s.buyer, s.seller, s.from, s.to, s.incoterm].some((v) => String(v || "").toLocaleLowerCase().includes(needle));
    });
  }, [shipments, q, status]);

  const onDelete = async (r) => {
    const ok = await askConfirm({ title: t("d.confirm.delTitle"), message: t("d.confirmDelete", { name: r.summary?.invoiceNo || t("d.untitled") }), confirmLabel: t("d.act.del"), requireText: [r.summary?.invoiceNo] });
    if (!ok) return;
    await deleteShipment(r.id);
    toast(t("d.deleted"));
  };
  const onDuplicate = async (r) => { await saveShipment(duplicateRecord(r)); toast(t("d.duplicated")); };

  if (!ready) return null;
  return (
    <div className="page">
      <header className="page-head">
        <div><h1>{t("d.list.title")}</h1><p className="muted">{t("d.list.count", { n: shipments.length })}</p></div>
        <a className="btn btn--primary" href="#/new"><Icon name="plus" />{t("d.nav.new")}</a>
      </header>
      <div className="toolbar">
        <label className="search">
          <Icon name="search" />
          <input className="input" type="search" placeholder={t("d.list.search")} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="segmented" role="group" aria-label={t("d.col.status")}>
          {["all", ...STATUSES].map((s) => <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>{t(s === "all" ? "d.status.all" : `d.status.${s}`)}</button>)}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state empty-state--sm">
          <p>{shipments.length ? t("d.list.noMatch") : t("d.empty.text")}</p>
          {!shipments.length && <a className="btn btn--primary" href="#/new">{t("d.empty.cta")}</a>}
        </div>
      ) : (
        <section className="card-block"><ShipmentTable rows={rows} onDuplicate={onDuplicate} onDelete={onDelete} /></section>
      )}
    </div>
  );
}
