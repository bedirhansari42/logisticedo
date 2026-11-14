/* Bir sevkiyat kaydını yükler, düzenlemeleri tutar ve kendiliğinden kaydeder: useRecord'un sevkiyat bağdaştırıcısı. */
import * as store from "@engine/store.js";
import { migrate, summarize } from "./shipment-state.js";
import { useApp } from "./app-context.jsx";
import { useRecord } from "./use-record.js";

// Kaydederken {...meta, ...} yazıldığı için, meta'ya alınmayan alanlar kayıttan silinir: yeni alan eklenirse buraya da ekle.
const adapter = {
  get: store.getShipment,
  migrate,
  summarize,
  toMeta: (rec) => ({ id: rec.id, status: rec.status, lhId: rec.lhId, companyId: rec.companyId || null, bankId: rec.bankId || null, bankAuto: rec.bankAuto !== false, createdAt: rec.createdAt, parse: rec.parse || null, proformaId: rec.proformaId || null })
};

export function useShipment(id) {
  const { saveShipment } = useApp();
  return useRecord(id, adapter, saveShipment);
}
