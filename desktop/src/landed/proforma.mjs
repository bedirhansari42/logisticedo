/* parseProforma sonucunu (res) maliyet taslağına aktarır. Girdiyi değiştirmez. */
import { newItemRow, newCostRow } from "./model.mjs";
import { CURRENCIES, INCOTERMS, defaultIncluded } from "./rules.mjs";
import { round } from "./money.mjs";

/** decimal: arayüzün ondalık ayırıcısı; sayılar o biçimde yazılır ki model.parseDraft yanlış okumasın. */
export function applyParseToDraft(draft, res, { decimal = "." } = {}) {
  const text = (n) => (n == null || !Number.isFinite(n) ? "" : String(n).replace(".", decimal));
  const out = structuredClone(draft);
  const warnings = [];
  const parsed = res?.items || [];
  if (!parsed.length) return { draft: out, warnings: [{ key: "d.lc.warn.noItems" }] };

  const cur = res.meta?.currency;
  if (CURRENCIES.includes(cur)) out.currency = cur;
  else warnings.push(cur ? { key: "d.lc.warn.currency", vars: { currency: cur } } : { key: "d.lc.warn.noCurrency" });
  if (INCOTERMS[res.shipment?.incoterm]) {
    out.incoterm = res.shipment.incoterm;
    // elle Incoterm değiştirmekle aynı: mevcut navlun/sigorta satırlarının "faturaya dahil" işareti yeni terime uyar
    out.costs = out.costs.map((c) => (c.kind === "freight" || c.kind === "insurance" ? { ...c, included: defaultIncluded(out.incoterm, c.kind) } : c));
  }

  let mixed = false;
  out.items = parsed.map((p) => {
    const row = newItemRow(out.defaultVatRate);
    const price = p.unitPrice != null ? p.unitPrice : p.amount != null && p.qty > 0 ? round(p.amount / p.qty, 4) : null;
    if (price == null) warnings.push({ key: "d.lc.warn.noPrice", vars: { name: p.description || p.code || "" } });
    if (p.currency && p.currency !== out.currency) mixed = true;
    return {
      ...row,
      name: p.description || p.code || "",
      hsCode: p.hsCode || "",
      qty: text(p.qty),
      unit: p.unit || row.unit,
      unitPrice: text(price),
      weightKg: text(p.grossWeight ?? p.netWeight),
      volumeM3: text(p.volume)
    }; // tedarikçinin KDV sütunu alınmaz: Türkiye ithalat KDV'si kullanıcının varsayılan oranıdır
  });
  if (mixed) warnings.push({ key: "d.lc.warn.mixedCurrency", vars: { currency: out.currency } });

  for (const kind of ["freight", "insurance"]) {
    const amount = res.charges?.[kind];
    if (amount > 0 && !out.costs.some((c) => c.kind === kind)) out.costs.push({ ...newCostRow(kind, out), amount: text(amount) });
  }
  return { draft: out, warnings };
}
