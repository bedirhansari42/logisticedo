/* Bir proforma kaydını yükler, düzenlemeleri tutar ve kendiliğinden kaydeder: useRecord'un proforma bağdaştırıcısı. */
import * as store from "@engine/store.js";
import { migrateProforma, summarizeProforma } from "./proforma-records.js";
import { useApp } from "./app-context.jsx";
import { useRecord } from "./use-record.js";

// Kaydederken {...meta, ...} yazıldığı için, meta'ya alınmayan alanlar kayıttan silinir: yeni alan eklenirse buraya da ekle.
const adapter = {
  get: store.getProforma,
  migrate: migrateProforma,
  summarize: summarizeProforma,
  toMeta: (rec) => ({ id: rec.id, source: rec.source || "created", lhId: rec.lhId || null, companyId: rec.companyId || null, bankId: rec.bankId || null, bankAuto: rec.bankAuto !== false, createdAt: rec.createdAt, parse: rec.parse || null, file: rec.file || null })
};

export function useProforma(id) {
  const { saveProforma } = useApp();
  return useRecord(id, adapter, saveProforma);
}
