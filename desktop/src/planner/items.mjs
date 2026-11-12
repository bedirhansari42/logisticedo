/* Planlayıcı satır girdisi: ayrıştırma, doğrulama ve taslak saklama. */

export const DRAFT_KEY = "lgx.planner";
export const DEFAULT_GAP = 0;

let counter = 0;
const uid = () => `r${Date.now().toString(36)}${(++counter).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const newRow = () => ({ id: uid(), name: "", l: "", w: "", h: "", qty: "", weight: "", palletized: false, upright: false });

export const MIN_DIM = 0.1; // cm

/** "1,5" ve "1.5" kabul edilir. Binlik ayırıcıya benzeyen "1,000" sessizce 1 sayılmaz: kind "sep". */
function read(v) {
  if (typeof v === "number") return Number.isFinite(v) ? { kind: "ok", n: v } : { kind: "bad" };
  const s = String(v ?? "").trim();
  if (s === "") return { kind: "empty" };
  if (/^[1-9]\d{0,2}([.,]\d{3})+$/.test(s)) return { kind: "sep" };
  const t = s.replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return { kind: "bad" };
  return { kind: "ok", n: Number(t) };
}

export function parseGap(v) {
  const r = read(v);
  if (r.kind === "empty") return { ok: true, value: 0 };
  if (r.kind !== "ok" || r.n < 0) return { ok: false };
  return { ok: true, value: r.n };
}

export function parseItemRow(row) {
  const errors = [];
  const bad = (field, r, key) => errors.push({ field, key: r.kind === "sep" ? "d.pl.err.sep" : key });
  const dim = (field) => {
    const r = read(row[field]);
    if (r.kind !== "ok" || r.n < MIN_DIM) { bad(field, r, "d.pl.err.dim"); return null; }
    return r.n;
  };
  const l = dim("l"), w = dim("w"), h = dim("h");

  let qty = null;
  const q = read(row.qty);
  if (q.kind !== "empty") {
    if (q.kind !== "ok" || !Number.isInteger(q.n) || q.n < 1) bad("qty", q, "d.pl.err.qty");
    else qty = q.n;
  }

  let weight;
  const wt = read(row.weight);
  if (wt.kind !== "empty") {
    if (wt.kind !== "ok" || wt.n < 0) bad("weight", wt, "d.pl.err.weight");
    else weight = wt.n;
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    item: { id: row.id, name: String(row.name ?? "").trim() || "Item", l, w, h, qty, palletized: !!row.palletized, upright: !!row.upright, weight }
  };
}

const defaultDraft = () => ({ rows: [newRow()], gap: DEFAULT_GAP, container: "40hc" });

export function loadDraft() {
  try {
    const raw = globalThis.localStorage?.getItem(DRAFT_KEY);
    if (!raw) return defaultDraft();
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.rows) || d.rows.length === 0) return defaultDraft();
    const rows = d.rows.filter((r) => r && typeof r === "object").map((r) => ({ ...newRow(), ...r, id: typeof r.id === "string" && r.id ? r.id : uid() }));
    if (!rows.length) return defaultDraft();
    const gap = Number.isFinite(d.gap) && d.gap >= 0 ? d.gap : DEFAULT_GAP;
    const container = ["20", "40", "40hc"].includes(d.container) ? d.container : "40hc";
    return { rows, gap, container };
  } catch {
    return defaultDraft();
  }
}

export function saveDraft(draft) {
  try { globalThis.localStorage?.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* yoksay */ }
}
