/* Yedek dosyası: tüm veriyi (sevkiyatlar, antetler ve Blob'ları, şirket/banka listeleri, taslaklar, tercihler) tek JSON'a yazar
   ve geri yüklemeyi planlar. Saf modül: IndexedDB/DOM yok; G/Ç `io.js` içindedir. */

export const BACKUP_FORMAT = "logisticedo-backup";
export const BACKUP_VERSION = 1;
/** Geri yüklenebilen localStorage anahtarları (başkası yok sayılır) */
export const LOCAL_KEYS = ["lgx.planner", "lgx.landed", "lgx.lang", "lgx.theme", "lgx.preview"];
/** Geri yüklenebilen kv anahtarları */
export const KV_KEYS = ["companies", "lhId", "companyId", "notes"];

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

async function blobToB64(blob) {
  const u8 = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64ToBlob(b64, type) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type });
}

async function encode(v) {
  if (v instanceof Blob) return { __blob: { type: v.type, b64: await blobToB64(v) } };
  if (Array.isArray(v)) return Promise.all(v.map(encode));
  if (isObj(v)) return Object.fromEntries(await Promise.all(Object.entries(v).map(async ([k, x]) => [k, await encode(x)])));
  return v;
}
function decode(v) {
  if (Array.isArray(v)) return v.map(decode);
  if (isObj(v)) {
    if (isObj(v.__blob) && typeof v.__blob.b64 === "string") return b64ToBlob(v.__blob.b64, v.__blob.type || "");
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
  }
  return v;
}

/** snapshot: { letterheads: [], shipments: [], kv: {anahtar: değer}, local: {anahtar: metin} } */
export async function createBackup(snapshot, { now = Date.now(), appVersion = "" } = {}) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now,
    appVersion,
    data: {
      letterheads: await encode(snapshot.letterheads || []),
      shipments: await encode(snapshot.shipments || []),
      kv: await encode(snapshot.kv || {}),
      local: { ...(snapshot.local || {}) }
    }
  };
}

export function validateBackup(b) {
  if (!isObj(b) || b.format !== BACKUP_FORMAT || typeof b.version !== "number" || !isObj(b.data)) return { ok: false, key: "d.bk.err.format" };
  const d = b.data;
  if (!Array.isArray(d.letterheads) || !Array.isArray(d.shipments) || !isObj(d.kv) || !isObj(d.local)) return { ok: false, key: "d.bk.err.format" };
  if (b.version > BACKUP_VERSION) return { ok: false, key: "d.bk.err.newer" };
  return { ok: true, summary: { shipments: d.shipments.length, letterheads: d.letterheads.length, companies: Array.isArray(d.kv.companies) ? d.kv.companies.length : 0, notes: Array.isArray(d.kv.notes?.cards) ? d.kv.notes.cards.length : 0 } };
}

/** Kimliğe göre birleştirir: yerelde yoksa eklenir, dosyadaki daha yeniyse (updatedAt) güncellenir, aksi halde yerel kalır. Hiçbir şey silinmez. */
function mergeById(local, incoming) {
  const byId = new Map(local.map((r) => [r.id, r]));
  const put = [];
  const counts = { added: 0, updated: 0, kept: 0 };
  for (const r of incoming) {
    const cur = byId.get(r.id);
    if (!cur) { put.push(r); counts.added++; }
    else if ((r.updatedAt || 0) > (cur.updatedAt || 0)) { put.push(r); counts.updated++; }
    else counts.kept++;
  }
  return { put, counts };
}

/** Not panosu: sütunlar kimliğe göre birleşir (yerel ad kalır, eksik olanlar eklenir); kartlarda daha yeni olan kazanır. Hiçbir şey silinmez. */
function mergeNotes(local, incoming) {
  const cols = mergeById(local.columns || [], (incoming.columns || []).filter(isObj));
  const cards = mergeById(local.cards || [], (incoming.cards || []).filter(isObj));
  if (!cols.put.length && !cards.put.length) return { board: null, counts: cards.counts };
  const put = new Map(cards.put.map((c) => [c.id, c]));
  const have = new Set((local.cards || []).map((c) => c.id));
  return {
    board: {
      columns: [...(local.columns || []), ...cols.put.filter((c) => !(local.columns || []).some((l) => l.id === c.id))],
      cards: [...(local.cards || []).map((c) => put.get(c.id) || c), ...cards.put.filter((c) => !have.has(c.id))]
    },
    counts: cards.counts
  };
}

/** current: yerel snapshot (createBackup ile aynı şekil). Dönüş: yazılacak kayıtlar ve sayılar; hiçbir şey yazmaz. */
export async function planRestore(backup, current) {
  const d = decode(backup.data);
  const sh = mergeById(current.shipments || [], d.shipments);
  const lh = mergeById(current.letterheads || [], d.letterheads);
  const kv = {};
  let companies = { added: 0, updated: 0, kept: 0 };
  let notes = { added: 0, updated: 0, kept: 0 };
  for (const key of KV_KEYS) {
    const v = d.kv[key];
    if (v === undefined) continue;
    if (key === "companies" && Array.isArray(v)) {
      const local = current.kv?.companies || [];
      const m = mergeById(local, v.filter(isObj));
      companies = m.counts;
      if (m.put.length) {
        const putIds = new Map(m.put.map((r) => [r.id, r]));
        kv.companies = [...local.map((r) => putIds.get(r.id) || r), ...m.put.filter((r) => !local.some((l) => l.id === r.id))];
      }
    } else if (key === "notes" && isObj(v) && isObj(current.kv?.notes)) {
      const m = mergeNotes(current.kv.notes, v);
      notes = m.counts;
      if (m.board) kv.notes = m.board;
    } else if (current.kv?.[key] === undefined) {
      if (key === "notes" && isObj(v)) notes = { added: Array.isArray(v.cards) ? v.cards.length : 0, updated: 0, kept: 0 };
      kv[key] = v;
    }
  }
  const local = {};
  for (const key of LOCAL_KEYS) if (typeof d.local[key] === "string") local[key] = d.local[key];
  return { shipments: sh.put, letterheads: lh.put, kv, local, counts: { shipments: sh.counts, letterheads: lh.counts, companies, notes } };
}
