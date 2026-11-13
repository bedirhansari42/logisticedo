/* Kanban not panosu: saf, değişmez (immutable) işlevler. DOM/IndexedDB yok; G/Ç sayfada. */

export const LABELS = ["ship", "me"]; // Sevkiyat, Kişisel
/** Sütun renkleri: sabit palet (anahtarlar; gerçek renkler dash.css'te, iki temada da okunur) */
export const COLORS = ["teal", "blue", "purple", "pink", "red", "amber"];
export const LIMITS = { title: 120, note: 2000, column: 40 };

let counter = 0;
const uid = (p) => `${p}${Date.now().toString(36)}${(++counter).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

/** names: varsayılan üç sütunun (kullanıcının dilindeki) adları; sütun adları sonradan kullanıcıya aittir. */
export const defaultBoard = (names) => ({ columns: names.map((name) => ({ id: uid("col"), name, color: null })), cards: [] });

const validDue = (s) => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
};

export function checkCard({ title, note, label, due }) {
  if (typeof title !== "string" || !title.trim()) return { ok: false, field: "title", key: "d.nt.err.title" };
  if (title.trim().length > LIMITS.title) return { ok: false, field: "title", key: "d.nt.err.long" };
  if (note != null && String(note).length > LIMITS.note) return { ok: false, field: "note", key: "d.nt.err.long" };
  if (label != null && label !== "" && !LABELS.includes(label)) return { ok: false, field: "label", key: "d.nt.err.label" };
  if (due != null && due !== "" && !validDue(due)) return { ok: false, field: "due", key: "d.nt.err.due" };
  return { ok: true };
}

export const cardsOf = (board, columnId) => board.cards.filter((c) => c.columnId === columnId).sort((a, b) => a.order - b.order);
const nextOrder = (board, columnId) => cardsOf(board, columnId).reduce((m, c) => Math.max(m, c.order), 0) + 1;

export function addColumn(board, name) {
  const n = String(name ?? "").trim().slice(0, LIMITS.column);
  return n ? { ...board, columns: [...board.columns, { id: uid("col"), name: n, color: null }] } : board;
}
export function renameColumn(board, id, name) {
  const n = String(name ?? "").trim().slice(0, LIMITS.column);
  return n ? { ...board, columns: board.columns.map((c) => (c.id === id ? { ...c, name: n } : c)) } : board;
}
/** color: palet anahtarı ya da null (renksiz). Palet dışı değer reddedilir (pano aynen döner). */
export function setColumnColor(board, id, color) {
  if (color !== null && !COLORS.includes(color)) return board;
  return { ...board, columns: board.columns.map((c) => (c.id === id ? { ...c, color } : c)) };
}
/** Sütunu `index` konumuna taşır (sınır dışı değerler başa/sona sıkıştırılır). Kartlar sütun kimliğine bağlı olduğu için yerinde kalır. */
export function moveColumn(board, id, index) {
  const from = board.columns.findIndex((c) => c.id === id);
  if (from < 0) return board;
  const rest = board.columns.filter((c) => c.id !== id);
  const at = Math.max(0, Math.min(index, rest.length));
  return { ...board, columns: [...rest.slice(0, at), board.columns[from], ...rest.slice(at)] };
}
/** Sütunu ve kartlarını siler (arayüz önce onay ister). Son sütun silinmez. */
export function deleteColumn(board, id) {
  if (board.columns.length <= 1) return board;
  return { columns: board.columns.filter((c) => c.id !== id), cards: board.cards.filter((c) => c.columnId !== id) };
}

export function addCard(board, columnId, { title, note = "", label = null, due = null }, now = Date.now()) {
  const card = { id: uid("card"), columnId, title: String(title).trim(), note: String(note || ""), label: label || null, due: due || null, order: nextOrder(board, columnId), createdAt: now, updatedAt: now };
  return { ...board, cards: [...board.cards, card] };
}

export function updateCard(board, id, patch, now = Date.now()) {
  return {
    ...board,
    cards: board.cards.map((c) => {
      if (c.id !== id) return c;
      const next = { ...c, updatedAt: now };
      if (patch.title !== undefined) next.title = String(patch.title).trim();
      if (patch.note !== undefined) next.note = String(patch.note || "");
      if (patch.label !== undefined) next.label = patch.label || null;
      if (patch.due !== undefined) next.due = patch.due || null;
      if (patch.columnId !== undefined && patch.columnId !== c.columnId) { next.columnId = patch.columnId; next.order = nextOrder(board, patch.columnId); }
      return next;
    })
  };
}

export const deleteCard = (board, id) => ({ ...board, cards: board.cards.filter((c) => c.id !== id) });

/** Kartı hedef sütunun index'ine taşır (sınırı aşarsa sona); hedef sütunun sırası 1..n yeniden numaralanır. */
export function moveCard(board, id, toColumnId, index, now = Date.now()) {
  const moving = board.cards.find((c) => c.id === id);
  if (!moving) return board;
  const rest = cardsOf(board, toColumnId).filter((c) => c.id !== id);
  const at = Math.max(0, Math.min(index, rest.length));
  const order = new Map([...rest.slice(0, at), moving, ...rest.slice(at)].map((c, i) => [c.id, i + 1]));
  return {
    ...board,
    cards: board.cards.map((c) => {
      if (c.id === id) return { ...c, columnId: toColumnId, order: order.get(id), updatedAt: now };
      return order.has(c.id) ? { ...c, order: order.get(c.id) } : c;
    })
  };
}

const todayIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Son tarihi geçmiş ve son sütunda ("tamamlandı" sayılır) olmayan kart gecikmiştir. */
export function isOverdue(board, card, now = new Date()) {
  const last = board.columns[board.columns.length - 1];
  return !!card.due && card.due < todayIso(now) && card.columnId !== last?.id;
}

/** Saklanmış/yüklenmiş veriyi onarır: çift ya da bozuk sütunlar, başlıksız kartlar atılır; bilinmeyen sütundaki kart ilk sütuna gider. */
export function normalizeBoard(raw, names) {
  if (!isObj(raw)) return defaultBoard(names);
  const seen = new Set();
  const columns = [];
  for (const c of Array.isArray(raw.columns) ? raw.columns : []) {
    if (!isObj(c) || typeof c.id !== "string" || !c.id || seen.has(c.id)) continue;
    seen.add(c.id);
    columns.push({ id: c.id, name: (typeof c.name === "string" ? c.name : String(c.name ?? "")).trim().slice(0, LIMITS.column) || "?", color: COLORS.includes(c.color) ? c.color : null });
  }
  if (!columns.length) return defaultBoard(names);
  const num = (v, d) => (Number.isFinite(v) ? v : d);
  const cards = [];
  (Array.isArray(raw.cards) ? raw.cards : []).forEach((c, i) => {
    if (!isObj(c) || typeof c.id !== "string" || typeof c.title !== "string" || !c.title.trim()) return;
    cards.push({
      id: c.id, columnId: seen.has(c.columnId) ? c.columnId : columns[0].id, title: c.title.trim().slice(0, LIMITS.title),
      note: typeof c.note === "string" ? c.note.slice(0, LIMITS.note) : "", label: LABELS.includes(c.label) ? c.label : null, due: validDue(c.due) ? c.due : null,
      order: num(c.order, i + 1), createdAt: num(c.createdAt, 0), updatedAt: num(c.updatedAt, 0)
    });
  });
  return { columns, cards };
}

/** Bırakma konumu: `beforeId` kartının önüne (null/bilinmiyorsa sona). Taşınan kart (movingId) sayılmaz; dönüş moveCard'ın index'idir.
 *  Süzgeç açıkken görünmeyen kartlar tam sıralamada korunur. */
export function indexBefore(board, columnId, beforeId, movingId) {
  const rest = cardsOf(board, columnId).filter((c) => c.id !== movingId);
  const i = rest.findIndex((c) => c.id === beforeId);
  return i < 0 ? rest.length : i;
}
