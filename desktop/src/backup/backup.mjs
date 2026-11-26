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
/** Yalnızca düz JSON döner: bilinmeyen yerdeki {__blob} kalıpları null olur (Blob yalnızca bilinen alanlarda kurulur). */
function plain(v) {
  if (Array.isArray(v)) return v.map(plain);
  if (isObj(v)) {
    if ("__blob" in v) return null;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  }
  return v;
}

/** {__blob} → Blob; tür izinli değilse ya da base64 bozuksa null. allow: tür → bool */
function toBlob(enc, allow) {
  if (!isObj(enc) || !isObj(enc.__blob) || typeof enc.__blob.b64 !== "string") return null;
  const type = typeof enc.__blob.type === "string" ? enc.__blob.type.toLowerCase() : "";
  const t = allow(type);
  if (!t) return null;
  try { return b64ToBlob(enc.__blob.b64, typeof t === "string" ? t : type); } catch { return null; }
}

/* ---- Geri yüklemede kayıt doğrulama: el yapımı ya da bozuk bir yedek arayüzü çökertmesin ---- */
const MAX_ID = 200;
const validId = (v) => typeof v === "string" && v.length > 0 && v.length <= MAX_ID;
const isPrim = (v) => typeof v === "string" || typeof v === "boolean" || v === null || (typeof v === "number" && Number.isFinite(v));
const clampTime = (v, now) => (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(v, 0), now) : 0);
const LH_TYPES = ["application/pdf", "image/png", "image/jpeg"];
const MIME = /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/;
/** Listelerde metin olarak çizilen kayıt alanları: varsa metin (ya da null) olmalı */
const TEXT_FIELDS = ["name", "status", "source", "lang", "thumb", "kind", "lhId", "companyId", "bankId", "proformaId"];
const COMPANY_TEXT = ["name", "address", "taxId", "contact", "signName", "signTitle", "signPlace", "lhId"];
const BANK_TEXT = ["currency", "bankName", "branch", "accountName", "iban", "swift", "accountNo"];

function cleanSummary(s) {
  if (!isObj(s)) return {};
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (isPrim(v)) out[k] = v;
    else if (Array.isArray(v) && v.every((x) => typeof x === "string")) out[k] = v;
  }
  return out;
}

/** Ortak kurallar; enc: aynı kaydın kodlanmış (Blob'ları {__blob}) hâli. Geçersizse null. */
function cleanRecord(enc, kind, now) {
  if (!isObj(enc) || !validId(enc.id)) return null;
  const r = plain(enc);
  for (const f of TEXT_FIELDS) if (f in r && r[f] !== null && typeof r[f] !== "string") delete r[f];
  if ("createdAt" in r) r.createdAt = clampTime(r.createdAt, now);
  if ("updatedAt" in r) r.updatedAt = clampTime(r.updatedAt, now);
  if ("bankAuto" in r && typeof r.bankAuto !== "boolean") r.bankAuto = true;
  if (kind === "letterheads") {
    r.data = toBlob(enc.data, (t) => LH_TYPES.includes(t));
    if (!r.data) return null;
    if ("preview" in enc) r.preview = toBlob(enc.preview, (t) => t === "image/jpeg" || t === "image/png");
    return r;
  }
  // sevkiyat / proforma
  if (!isObj(r.state)) return null;
  if ("summary" in r) r.summary = cleanSummary(r.summary);
  if ("auto" in r) r.auto = Array.isArray(r.auto) ? r.auto.filter((x) => typeof x === "string") : [];
  if (kind === "proformas" && "file" in enc) {
    const f = enc.file;
    const blob = isObj(f) ? toBlob(f.blob, (t) => (MIME.test(t) ? t : "application/octet-stream")) : null;
    r.file = blob ? { name: typeof f.name === "string" ? f.name : "", type: blob.type, size: blob.size, blob } : null;
  }
  return r;
}

function cleanList(list, kind, now, skip) {
  const out = [];
  for (const enc of list) { const r = cleanRecord(enc, kind, now); if (r) out.push(r); else skip.n++; }
  return out;
}

function cleanCompany(c, skip, now) {
  if (!isObj(c) || !validId(c.id)) { skip.n++; return null; }
  const r = plain(c);
  for (const f of COMPANY_TEXT) if (f in r && typeof r[f] !== "string") r[f] = "";
  if ("updatedAt" in r) r.updatedAt = clampTime(r.updatedAt, now);
  r.banks = (Array.isArray(r.banks) ? r.banks : []).filter((b) => isObj(b) && validId(b.id)).map((b) => {
    const x = { ...b };
    for (const f of BANK_TEXT) if (f in x && typeof x[f] !== "string") x[f] = "";
    if ("isDefault" in x && typeof x.isDefault !== "boolean") x.isDefault = false;
    return x;
  });
  return r;
}

/** snapshot: { letterheads: [], shipments: [], proformas: [], kv: {anahtar: değer}, local: {anahtar: metin} } */
export async function createBackup(snapshot, { now = Date.now(), appVersion = "" } = {}) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now,
    appVersion,
    data: {
      letterheads: await encode(snapshot.letterheads || []),
      shipments: await encode(snapshot.shipments || []),
      proformas: await encode(snapshot.proformas || []),
      kv: await encode(snapshot.kv || {}),
      local: { ...(snapshot.local || {}) }
    }
  };
}

export function validateBackup(b) {
  if (!isObj(b) || b.format !== BACKUP_FORMAT || typeof b.version !== "number" || !isObj(b.data)) return { ok: false, key: "d.bk.err.format" };
  const d = b.data;
  if (!Array.isArray(d.letterheads) || !Array.isArray(d.shipments) || !isObj(d.kv) || !isObj(d.local)) return { ok: false, key: "d.bk.err.format" };
  if (d.proformas !== undefined && !Array.isArray(d.proformas)) return { ok: false, key: "d.bk.err.format" };
  if (b.version > BACKUP_VERSION) return { ok: false, key: "d.bk.err.newer" };
  return { ok: true, summary: { shipments: d.shipments.length, letterheads: d.letterheads.length, companies: Array.isArray(d.kv.companies) ? d.kv.companies.length : 0, notes: Array.isArray(d.kv.notes?.cards) ? d.kv.notes.cards.length : 0, proformas: (d.proformas || []).length } };
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

const idList = (v, now = Infinity) => (Array.isArray(v) ? v.filter((x) => isObj(x) && validId(x.id)).map((x) => ("updatedAt" in x ? { ...x, updatedAt: clampTime(x.updatedAt, now) } : x)) : []);

/** Not panosu: sütunlar kimliğe göre birleşir (yerel ad kalır, eksik olanlar eklenir); kartlarda daha yeni olan kazanır. Hiçbir şey silinmez. */
function mergeNotes(local, incoming, now) {
  const cols = mergeById(local.columns || [], idList(incoming.columns, now));
  const cards = mergeById(local.cards || [], idList(incoming.cards, now));
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

/** current: yerel snapshot (createBackup ile aynı şekil). Dönüş: yazılacak kayıtlar, sayılar ve atlanan (bozuk) kayıt sayısı;
    hiçbir şey yazmaz. Dosyadaki her kayıt doğrulanır (kimlik, zaman damgası, özet, Blob alanları); geçersizler atlanır. */
export async function planRestore(backup, current, { now = Date.now() } = {}) {
  const d = backup.data;
  const skip = { n: 0 };
  const sh = mergeById(current.shipments || [], cleanList(d.shipments, "shipments", now, skip));
  const lh = mergeById(current.letterheads || [], cleanList(d.letterheads, "letterheads", now, skip));
  const pf = mergeById(current.proformas || [], cleanList(d.proformas || [], "proformas", now, skip));
  const kv = {};
  let companies = { added: 0, updated: 0, kept: 0 };
  let notes = { added: 0, updated: 0, kept: 0 };
  for (const key of KV_KEYS) {
    const v = plain(d.kv[key]);
    if (v === undefined) continue;
    if (key === "companies") {
      if (!Array.isArray(v)) continue;
      const local = current.kv?.companies || [];
      const m = mergeById(local, v.map((c) => cleanCompany(c, skip, now)).filter(Boolean));
      companies = m.counts;
      if (m.put.length) {
        const putIds = new Map(m.put.map((r) => [r.id, r]));
        kv.companies = [...local.map((r) => putIds.get(r.id) || r), ...m.put.filter((r) => !local.some((l) => l.id === r.id))];
      }
    } else if (key === "notes") {
      if (!isObj(v)) continue;
      if (isObj(current.kv?.notes)) {
        const m = mergeNotes(current.kv.notes, v, now);
        notes = m.counts;
        if (m.board) kv.notes = m.board;
      } else if (current.kv?.notes === undefined) {
        const board = { ...v, columns: idList(v.columns, now), cards: idList(v.cards, now) };
        notes = { added: board.cards.length, updated: 0, kept: 0 };
        kv.notes = board;
      }
    } else if (typeof v === "string" && current.kv?.[key] === undefined) {
      kv[key] = v;
    }
  }
  const local = {};
  for (const key of LOCAL_KEYS) if (typeof d.local[key] === "string") local[key] = d.local[key];
  return { shipments: sh.put, proformas: pf.put, letterheads: lh.put, kv, local, skipped: skip.n, counts: { shipments: sh.counts, proformas: pf.counts, letterheads: lh.counts, companies, notes } };
}
