/* Proforma kayıtları: yeni kayıt, özet, taşıma, sevkiyata dönüştürme, dosya içe aktarma.
   Saf kısımlar proforma/*.mjs içinde (testli); burası motor ve arayüz işlevlerini bağlar. */
import { computeTotals, createEmptyState, missingProforma, uid } from "@engine/doc-model.js";
import { parseProforma } from "@engine/parse/index.js";
import { getLang } from "@i18n";
import { applyParsed, migrate, newShipmentRecord, suggestInvoiceNo } from "./shipment-state.js";
import { proformaToShipmentState } from "../proforma/convert.mjs";
import { buildParseSummary } from "../components/ParseReport.jsx";

export const proformaTitle = (rec) => rec.summary?.proformaNo || "";

/** Kayıtlı durumu güncel şemaya uydurur; proforma notları eksikse tamamlanır */
export function migrateProforma(saved) {
  const state = migrate(saved);
  state.proforma = { ...createEmptyState().proforma, ...saved.proforma };
  for (const it of state.items) it.currency = ""; // proformada tek para birimi var: belge para birimi geçerli
  return state;
}

/** Listede gösterilen kısa özet (kayıtla birlikte saklanır) */
export function summarizeProforma(state) {
  const T = computeTotals(state);
  return {
    proformaNo: state.meta.proformaNo.trim(),
    buyer: state.buyer.name.trim(),
    seller: state.seller.name.trim(),
    currency: (state.meta.currency || "").toUpperCase(),
    total: T.total,
    items: state.items.filter((it) => it.description || it.qty).length,
    missing: missingProforma(state)
  };
}

/** source: "created" | "imported"; file: { name, type, size, blob } | null */
export function newProformaRecord({ state, auto = new Set(), source = "created", lhId = null, companyId = null, bankId = null, bankAuto = true, parse = null, file = null }) {
  const now = Date.now();
  return { id: uid(), source, lhId, companyId, bankId, bankAuto, createdAt: now, updatedAt: now, lang: getLang(), state, auto: [...auto], parse, file, summary: summarizeProforma(state) };
}

const today = () => createEmptyState().meta.invoiceDate;

/** Proformadan yeni sevkiyat kaydı (kopya). Şirket/antet verilmezse proformanınki kullanılır. */
export function shipmentFromProforma(pf, { lhId, companyId } = {}) {
  const state = proformaToShipmentState(migrateProforma(pf.state), { today: today(), suggestInvoiceNo, emptyProforma: createEmptyState().proforma });
  const rec = newShipmentRecord({ state, lhId: lhId ?? pf.lhId ?? null, companyId: companyId ?? pf.companyId ?? null, proformaId: pf.id });
  rec.bankId = pf.bankId || null;
  rec.bankAuto = pf.bankAuto !== false;
  rec.lang = pf.lang || getLang();
  return rec;
}

/** Dosyayı tarayıcıda okuyup proforma durumuna çevirir; okunamazsa fırlatır (kayıt oluşturulmaz). */
export async function importProformaFile(file, { prev = null, profile = null } = {}) {
  const res = await parseProforma(file);
  const { state, auto } = applyParsed(res, { prev, profile });
  state.meta.invoiceNo = ""; // ticari fatura no önerisi proformaya ait değil
  auto.delete("meta.invoiceNo");
  state.proforma = createEmptyState().proforma;
  return {
    state, auto,
    parse: buildParseSummary(file.name, res),
    file: { name: file.name, type: file.type || "", size: file.size, blob: file.slice(0, file.size, file.type) }
  };
}
