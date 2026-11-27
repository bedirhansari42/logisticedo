/* Palet bazlı packing list: her palet bir kart (no, cins, ölçü, net, brüt, not) ve altında kalemlere bağlı içerik satırları.
   Hesaplar motorda (assets/js/app/pallets.js, testli); burada yalnızca düzenleme. */
import { useMemo } from "react";
import { ICONS } from "@common";
import { useT } from "../../lib/i18n.js";
import { askConfirm } from "../../lib/confirm.js";
import { newPallet, fmtUi } from "@engine/doc-model.js";
import { allocation, orphanLines, cartonNumbers, lineQty, palletWeight, allOnOnePallet, fillRemaining, addItemLine, realItems, itemRemaining, cleanCartons, cleanAmount, palletIsBlank } from "@engine/pallets.js";
import { AutoArea } from "./Field.jsx";
import { Icon } from "../Icons.jsx";
import { ListInput } from "./ListInput.jsx";

const oneLine = (v) => String(v || "").trim().replace(/\s*\n\s*/g, " ");
/** Miktar: tam sayıysa ondalıksız, değilse 3 ondalık */
const fmtN = (v) => fmtUi(v, Number.isInteger(v) ? 0 : 3);
/** Önerilen (boş alana kalemlerden hesaplanan) değer yer tutucu olarak */
const ph = (r, fmt) => (r.value != null && r.suggested ? fmt(r.value) : undefined);
const fmtW = (v) => fmtUi(v, 2);

export function PalletsTable({ ctx }) {
  const t = useT();
  const { state, update } = ctx;
  const pal = state.pallets;
  const items = useMemo(() => new Map(state.items.map((it) => [it.id, it])), [state.items]);
  const alloc = useMemo(() => allocation(state), [state]);
  const orphans = useMemo(() => new Set(orphanLines(state)), [state]);
  const cno = useMemo(() => cartonNumbers(state), [state]);
  const hasItems = realItems(state).length > 0;

  const editPallet = (id, f, raw) => update((d) => {
    const p = d.pallets.find((x) => x.id === id);
    if (p) p[f] = f === "net" || f === "gross" ? cleanAmount(raw) : raw;
  });
  const editLine = (pid, lid, f, raw) => update((d) => {
    const l = d.pallets.find((x) => x.id === pid)?.lines.find((x) => x.id === lid);
    if (l) l[f] = f === "cartons" ? cleanCartons(raw) : f === "qty" ? cleanAmount(raw) : raw; // cno: serbest metin
  });
  const removeLine = (pid, lid) => update((d) => { const p = d.pallets.find((x) => x.id === pid); if (p) p.lines = p.lines.filter((l) => l.id !== lid); });
  const removePallet = async (p, name) => {
    if (!palletIsBlank(p) && !(await askConfirm({ title: t("d.pal.removePallet"), message: t("d.pal.confirmRemove", { name }), confirmLabel: t("d.pal.removePallet") }))) return;
    update((d) => { d.pallets = d.pallets.filter((x) => x.id !== p.id); });
  };
  const addPallet = () => update((d) => { d.pallets.push(newPallet({ no: String(d.pallets.length + 1) })); });
  const allOne = async () => {
    if (pal.length && !(await askConfirm({ title: t("d.pal.allOne"), message: t("d.pal.confirmAllOne"), confirmLabel: t("d.pal.allOne") }))) return;
    update((d) => { allOnOnePallet(d); });
  };

  /** Dağıtım özeti: kalem kalem eksik / fazla */
  const unitOf = (it, a) => (a.basis === "cartons" ? (it.packageType || state.packing.packageType || t("d.pal.cartons")) : it.unit || "").toUpperCase();
  const issues = alloc.filter((a) => a.status !== "ok").map((a) => {
    const it = items.get(a.itemId);
    const byCtn = a.basis === "cartons";
    return { key: a.itemId, text: t(a.status === "over" ? "d.pal.over" : "d.pal.under", { desc: oneLine(it.description) || it.code || "—", assigned: fmtN(byCtn ? a.cartons.assigned : a.qty.assigned), total: fmtN(byCtn ? a.cartons.total : a.qty.total), unit: unitOf(it, a) }) };
  });
  /** "Ürün ekle" seçeneği: açıklama ve kalemin henüz palete konmamış kısmı */
  const choiceLabel = (it) => {
    const desc = oneLine(it.description) || it.code || "—";
    const r = itemRemaining(state, it);
    const key = r.cartons != null ? "cartons" : r.qty != null ? "qty" : null;
    if (!key) return desc;
    return `${desc} · ${r[key] > 0 ? t("d.pal.left", { n: fmtN(r[key]), unit: unitOf(it, { basis: key }) }).trim() : t("d.pal.noneLeft")}`;
  };

  return (
    <>
      <p className="muted">{t("d.pal.hint")}</p>
      <div className="items-bar">
        <div className="dist-actions">
          <button className="btn btn--ghost btn--sm" type="button" onClick={allOne} disabled={!hasItems}>{t("d.pal.allOne")}</button>
          <button className="btn btn--ghost btn--sm" type="button" onClick={addPallet}><Icon name="plus" /><span>{t("pal.add")}</span></button>
        </div>
        {pal.length > 0 && <span className="muted">{t("pal.count", { n: pal.length })}</span>}
      </div>

      {pal.length > 0 && (issues.length || orphans.size ? (
        <div className="banner pal-alloc" role="status">
          <Icon name="warn" />
          <div className="req-text">
            {issues.map((x) => <p key={x.key}>{x.text}</p>)}
            {orphans.size > 0 && <p>{t("d.pal.orphan")}</p>}
          </div>
        </div>
      ) : <p className="pal-ok">{t("d.pal.allAssigned")}</p>)}

      {!pal.length && <p className="muted pal-empty">{t("d.pal.empty")}</p>}

      <div className="pal-list">
        {pal.map((p, i) => {
          const net = palletWeight(state, p, "net"), gross = palletWeight(state, p, "gross");
          const label = (k) => `${t(k)} ${p.no || i + 1}`;
          const choices = realItems(state);
          return (
            <section key={p.id} className="pal-card" data-id={p.id}>
              <div className="pal-head">
                <label className="pal-f pal-f--no"><span>{t("pal.no")}</span><input value={p.no} placeholder={String(i + 1)} onChange={(e) => editPallet(p.id, "no", e.target.value)} aria-label={label("pal.no")} /></label>
                <label className="pal-f"><span>{t("pal.type")}</span><ListInput type="text" list="dl-pkg" value={p.type} onChange={(e) => editPallet(p.id, "type", e.target.value)} aria-label={label("pal.type")} /></label>
                <label className="pal-f"><span>{t("pal.dims")}</span><input value={p.dimensions} placeholder="120x80x150" onChange={(e) => editPallet(p.id, "dimensions", e.target.value)} aria-label={label("pal.dims")} /></label>
                <label className="pal-f pal-f--num"><span>{t("pal.net")}</span><input className="num" inputMode="decimal" value={p.net} placeholder={ph(net, fmtW)} onChange={(e) => editPallet(p.id, "net", e.target.value)} aria-label={label("pal.net")} /></label>
                <label className="pal-f pal-f--num"><span>{t("pal.gross")}</span><input className="num" inputMode="decimal" value={p.gross} placeholder={ph(gross, fmtW)} onChange={(e) => editPallet(p.id, "gross", e.target.value)} aria-label={label("pal.gross")} /></label>
                <button type="button" className="icon-btn icon-btn--plain icon-btn--danger" title={t("pal.remove")} aria-label={label("pal.remove")} onClick={() => removePallet(p, `${t("pal.no")} ${p.no || i + 1}`)} dangerouslySetInnerHTML={{ __html: ICONS.trash }} />
              </div>
              <div className="items-wrap">
                <table className="items pal-lines">
                  <thead>
                    <tr>
                      <th className="w-desc">{t("it.desc")}</th><th className="w-hs">{t("it.hs")}</th>
                      <th className="w-num">{t("d.pal.cartons")}</th><th className="w-num">{t("d.pal.qty")}</th><th className="w-unit">{t("it.unit")}</th>
                      <th className="w-cno">{t("d.pal.cno")}</th><th className="it-act" />
                    </tr>
                  </thead>
                  <tbody>
                    {!p.lines.length && <tr className="it-empty"><td colSpan={7}>{t("d.pal.noLines")}</td></tr>}
                    {p.lines.map((l) => {
                      const it = items.get(l.itemId);
                      if (!it || orphans.has(l.id)) {
                        return (
                          <tr key={l.id} className="pal-orphan"><td colSpan={6} className="warn-text">{t("d.pal.orphan")}</td>
                            <td className="it-act"><button type="button" className="icon-btn icon-btn--plain icon-btn--danger" title={t("pal.remove")} aria-label={t("pal.remove")} onClick={() => removeLine(p.id, l.id)} dangerouslySetInnerHTML={{ __html: ICONS.trash }} /></td></tr>
                        );
                      }
                      const q = lineQty(state, l, it);
                      return (
                        <tr key={l.id} data-id={l.id}>
                          <td className="w-desc pal-desc">{oneLine(it.description) || it.code || "—"}</td>
                          <td className="w-hs pal-ro">{it.hsCode || "—"}</td>
                          <td className="w-num"><input className="num" inputMode="numeric" value={l.cartons} onChange={(e) => editLine(p.id, l.id, "cartons", e.target.value)} aria-label={`${t("d.pal.cartons")} ${oneLine(it.description)}`} /></td>
                          <td className="w-num"><input className="num" inputMode="decimal" value={l.qty} placeholder={ph(q, fmtN)} onChange={(e) => editLine(p.id, l.id, "qty", e.target.value)} aria-label={`${t("d.pal.qty")} ${oneLine(it.description)}`} /></td>
                          <td className="w-unit pal-ro">{(it.unit || "").toUpperCase()}</td>
                          <td className="w-cno"><input value={l.cno || ""} maxLength={40} placeholder={cno.get(l.id)?.suggested ? cno.get(l.id).value : undefined} onChange={(e) => editLine(p.id, l.id, "cno", e.target.value)} aria-label={`${t("d.pal.cno")} ${oneLine(it.description)}`} /></td>
                          <td className="it-act"><button type="button" className="icon-btn icon-btn--plain icon-btn--danger" title={t("pal.remove")} aria-label={t("pal.remove")} onClick={() => removeLine(p.id, l.id)} dangerouslySetInnerHTML={{ __html: ICONS.trash }} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="pal-foot">
                <select className="select" value="" aria-label={label("d.pal.addItem")} disabled={!choices.length}
                  onChange={(e) => { const v = e.target.value; if (v) update((d) => { addItemLine(d, p.id, v); }); }}>
                  <option value="">{t("d.pal.addItem")}</option>
                  {choices.map((it) => <option key={it.id} value={it.id}>{choiceLabel(it)}</option>)}
                </select>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => update((d) => { fillRemaining(d, p.id); })} disabled={!alloc.some((a) => a.status === "under")}>{t("d.pal.fillHere")}</button>
                <label className="pal-f pal-note"><span>{t("d.pal.note")}</span><AutoArea value={p.contents} onChange={(e) => editPallet(p.id, "contents", e.target.value)} aria-label={label("d.pal.note")} /></label>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
