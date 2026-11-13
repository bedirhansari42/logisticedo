/* Yedek G/Ç: IndexedDB ve localStorage'dan okur / yazar. Mantık backup.mjs'te (testli). */
import * as store from "@engine/store.js";
import { createBackup, LOCAL_KEYS, KV_KEYS } from "./backup.mjs";

export async function collectSnapshot() {
  const kv = {};
  for (const k of KV_KEYS) { const v = await store.kvGet(k); if (v !== undefined) kv[k] = v; }
  const local = {};
  for (const k of LOCAL_KEYS) { try { const v = localStorage.getItem(k); if (v != null) local[k] = v; } catch { /* yoksay */ } }
  return { letterheads: await store.listLetterheads(), shipments: await store.listShipments(), kv, local };
}

export async function exportBackup() {
  return createBackup(await collectSnapshot(), { appVersion: __APP_VERSION__ });
}

/** planRestore çıktısını yazar. Kalıcı depoya yazılamazsa hata fırlatır (bellek yedeğine sessizce düşmez). */
export async function applyPlan(plan) {
  let ok = true;
  for (const l of plan.letterheads) ok = (await store.saveLetterhead(l, { touch: false })) && ok;
  for (const s of plan.shipments) ok = (await store.saveShipment(s)) && ok;
  if (!ok) throw new Error("storage");
  for (const [k, v] of Object.entries(plan.kv)) await store.kvSet(k, v);
  for (const [k, v] of Object.entries(plan.local)) { try { localStorage.setItem(k, v); } catch { /* yoksay */ } }
}
