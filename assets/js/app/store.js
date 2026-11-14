/* Tarayıcı içi kalıcı depo (IndexedDB). Antetler ve taslak burada tutulur; hiçbir şey sunucuya gitmez. */

const DB_NAME = "logisticedo";
const DB_VERSION = 3;
let dbPromise = null;
let memoryFallback = null; // IndexedDB kullanılamıyorsa oturum belleği
const fallback = () => memoryFallback || { letterheads: new Map(), kv: new Map(), shipments: new Map(), proformas: new Map() };

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) { reject(new Error("IndexedDB yok")); return; }
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("letterheads")) db.createObjectStore("letterheads", { keyPath: "id" });
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("shipments")) db.createObjectStore("shipments", { keyPath: "id" });
      if (!db.objectStoreNames.contains("proformas")) db.createObjectStore("proformas", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB açılamadı"));
    req.onblocked = () => reject(new Error("IndexedDB engellendi"));
  }).catch((e) => {
    memoryFallback = fallback();
    throw e;
  });
  return dbPromise;
}

function tx(storeName, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    let result;
    Promise.resolve(fn(store)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("İşlem iptal edildi"));
  }));
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function isPersistentAvailable() {
  try { await open(); return true; } catch { return false; }
}

export async function requestPersistence() {
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch { /* yoksay */ }
}

export async function listLetterheads() {
  try {
    const all = await tx("letterheads", "readonly", (s) => reqP(s.getAll()));
    return (all || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch {
    return memoryFallback ? [...memoryFallback.letterheads.values()] : [];
  }
}

export async function getLetterhead(id) {
  if (!id) return null;
  try {
    return (await tx("letterheads", "readonly", (s) => reqP(s.get(id)))) || null;
  } catch {
    return memoryFallback?.letterheads.get(id) || null;
  }
}

export async function saveLetterhead(rec, { touch = true } = {}) {
  if (touch) rec.updatedAt = Date.now(); // yedekten yüklerken özgün zaman damgası korunur
  try {
    await tx("letterheads", "readwrite", (s) => reqP(s.put(rec)));
    return true;
  } catch {
    memoryFallback = fallback();
    memoryFallback.letterheads.set(rec.id, rec);
    return false;
  }
}

export async function deleteLetterhead(id) {
  try {
    await tx("letterheads", "readwrite", (s) => reqP(s.delete(id)));
  } catch {
    memoryFallback?.letterheads.delete(id);
  }
}

export async function kvGet(key) {
  try {
    return await tx("kv", "readonly", (s) => reqP(s.get(key)));
  } catch {
    return memoryFallback?.kv.get(key);
  }
}

export async function kvSet(key, value) {
  try {
    await tx("kv", "readwrite", (s) => reqP(s.put(value, key)));
  } catch {
    memoryFallback = fallback();
    memoryFallback.kv.set(key, value);
  }
}

export async function kvDel(key) {
  try {
    await tx("kv", "readwrite", (s) => reqP(s.delete(key)));
  } catch {
    memoryFallback?.kv.delete(key);
  }
}

/* --- Kayıtlı sevkiyatlar (masaüstü panel) -------------------------------------------------- */

export async function listShipments() {
  try {
    const all = await tx("shipments", "readonly", (s) => reqP(s.getAll()));
    return (all || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch {
    return memoryFallback?.shipments ? [...memoryFallback.shipments.values()] : [];
  }
}

export async function getShipment(id) {
  if (!id) return null;
  try {
    return (await tx("shipments", "readonly", (s) => reqP(s.get(id)))) || null;
  } catch {
    return memoryFallback?.shipments?.get(id) || null;
  }
}

export async function saveShipment(rec) {
  try {
    await tx("shipments", "readwrite", (s) => reqP(s.put(rec)));
    return true;
  } catch {
    memoryFallback = fallback();
    (memoryFallback.shipments = memoryFallback.shipments || new Map()).set(rec.id, rec);
    return false;
  }
}

export async function deleteShipment(id) {
  try {
    await tx("shipments", "readwrite", (s) => reqP(s.delete(id)));
  } catch {
    memoryFallback?.shipments?.delete(id);
  }
}

/* --- Proforma faturalar ------------------------------------------------------------------- */

export async function listProformas() {
  try {
    const all = await tx("proformas", "readonly", (s) => reqP(s.getAll()));
    return (all || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch {
    return memoryFallback?.proformas ? [...memoryFallback.proformas.values()] : [];
  }
}

export async function getProforma(id) {
  if (!id) return null;
  try {
    return (await tx("proformas", "readonly", (s) => reqP(s.get(id)))) || null;
  } catch {
    return memoryFallback?.proformas?.get(id) || null;
  }
}

export async function saveProforma(rec) {
  try {
    await tx("proformas", "readwrite", (s) => reqP(s.put(rec)));
    return true;
  } catch {
    memoryFallback = fallback();
    (memoryFallback.proformas = memoryFallback.proformas || new Map()).set(rec.id, rec);
    return false;
  }
}

export async function deleteProforma(id) {
  try {
    await tx("proformas", "readwrite", (s) => reqP(s.delete(id)));
  } catch {
    memoryFallback?.proformas?.delete(id);
  }
}
