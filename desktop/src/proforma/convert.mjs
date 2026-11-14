/* Proforma durumunu yeni bir sevkiyat durumuna çevirir (saf; motor işlevleri dışarıdan verilir). */

/** state: proforma durumu. Derin kopya döner; girdiye dokunmaz. */
export function proformaToShipmentState(state, { today, suggestInvoiceNo, emptyProforma }) {
  const out = structuredClone(state);
  const pi = String(out.meta.proformaNo || "").trim();
  out.meta.invoiceNo = pi ? suggestInvoiceNo(pi) : "";
  out.meta.plNo = "";
  out.meta.invoiceDate = today;
  out.proforma = structuredClone(emptyProforma);
  return out;
}
