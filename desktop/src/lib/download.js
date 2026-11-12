/* Belge üretimi ve kaydetme (eski sayfadaki download() mantığı). */
import { buildPdf } from "@engine/pdf-builder.js";
import { buildXlsx } from "@engine/excel-builder.js";
import { safeFileName } from "@engine/doc-model.js";

export async function buildDownload(kind, s, lh) {
  const base = safeFileName(s.meta.invoiceNo) || "document";
  if (kind === "xlsx") return { blob: await buildXlsx(s), name: `CI-PL_${base}.xlsx` };
  const bytes = await buildPdf(s, lh, kind);
  const names = {
    ci: `Commercial-Invoice_${base}.pdf`,
    pl: `Packing-List_${safeFileName(s.meta.plNo) || base}.pdf`,
    si: `Shipping-Instruction_${safeFileName(s.ship.siNo) || base}.pdf`,
    bl: `BL-Draft_${safeFileName(s.ship.blNo) || base}.pdf`,
    origin: `Declaration-of-Origin_${safeFileName(s.origin.certNo) || base}.pdf`,
    loading: `Loading-Instruction_${base}.pdf`,
    coo: `Certificate-of-Origin-Request_${base}.pdf`,
    eur1: `EUR1-Request_${base}.pdf`,
    ins: `Insurance-Request_${base}.pdf`,
    trans: `Transport-Order_${base}.pdf`,
    prealert: `Pre-Alert_${base}.pdf`,
    pallet: `Packing-List-by-Pallet_${base}.pdf`,
    cmr: `CMR_${base}.pdf`,
    poa: `Customs-POA_${base}.pdf`,
    contract: `Sales-Contract_${base}.pdf`,
    bill: `Bill-of-Exchange_${base}.pdf`,
    labels: `Labels_${base}.pdf`,
    all: `Shipping-Documents_${base}.pdf`
  };
  return { blob: new Blob([bytes], { type: "application/pdf" }), name: names[kind] || `CI-PL_${base}.pdf` };
}

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
