/* Maliyet sayfasının taslağı: metin alanları, localStorage, metinden calcLanded girdisine çevirme. */
import { defaultIncluded, DEFAULTS, CURRENCIES, INCOTERMS, ALLOC_KEYS } from "./rules.mjs";

export const DRAFT_KEY = "lgx.landed";
const KINDS = ["freight", "insurance", "deduct", "local"];

let counter = 0;
const uid = () => `l${Date.now().toString(36)}${(++counter).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const newItemRow = (vatRate = String(DEFAULTS.vatRate)) => ({
  id: uid(), name: "", hsCode: "", qty: "", unit: "PCS", unitPrice: "", weightKg: "", volumeM3: "",
  dutyRate: "", emyRate: "", kkdfRate: "", otherRate: "", otherAmount: "", otvRate: "", vatRate
});

export const newCostRow = (kind, draft) => ({
  id: uid(), kind, label: "", amount: "", currency: draft.currency,
  included: kind === "freight" || kind === "insurance" ? defaultIncluded(draft.incoterm, kind) : false,
  alloc: kind === "freight" ? "auto" : "value",
  vatRate: kind === "local" ? draft.defaultVatRate : ""
});

export const defaultDraft = () => ({
  currency: "USD", rates: {}, incoterm: "FOB", vatDeductible: true, kkdfInVat: true, flatInsurance: true,
  defaultVatRate: String(DEFAULTS.vatRate), items: [newItemRow()], costs: []
});

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

export function loadDraft() {
  try {
    const raw = globalThis.localStorage?.getItem(DRAFT_KEY);
    if (!raw) return defaultDraft();
    const d = JSON.parse(raw);
    if (!isObj(d)) return defaultDraft();
    const base = defaultDraft();
    const out = {
      ...base,
      currency: CURRENCIES.includes(d.currency) ? d.currency : base.currency,
      incoterm: INCOTERMS[d.incoterm] ? d.incoterm : base.incoterm,
      rates: isObj(d.rates) ? Object.fromEntries(Object.entries(d.rates).map(([k, v]) => [k, String(v ?? "")])) : {},
      vatDeductible: d.vatDeductible !== false,
      kkdfInVat: d.kkdfInVat !== false,
      flatInsurance: d.flatInsurance !== false,
      defaultVatRate: typeof d.defaultVatRate === "string" ? d.defaultVatRate : base.defaultVatRate
    };
    const items = (Array.isArray(d.items) ? d.items : []).filter(isObj).map((r) => ({ ...newItemRow(out.defaultVatRate), ...r, id: typeof r.id === "string" && r.id ? r.id : uid() }));
    out.items = items.length ? items : [newItemRow(out.defaultVatRate)];
    out.costs = (Array.isArray(d.costs) ? d.costs : []).filter((r) => isObj(r) && KINDS.includes(r.kind))
      .map((r) => ({ ...newCostRow(r.kind, out), ...r, id: typeof r.id === "string" && r.id ? r.id : uid() }));
    return out;
  } catch {
    return defaultDraft();
  }
}

export function saveDraft(draft) {
  try { globalThis.localStorage?.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* yoksay */ }
}

/** Fatura para birimi + masraf satırlarının para birimleri (TRY hariç, tekrarsız). */
export function currenciesNeeded(draft) {
  return [...new Set([draft.currency, ...draft.costs.map((c) => c.currency)])].filter((c) => c && c !== "TRY");
}

const blank = (v) => String(v ?? "").trim() === "";

/** Metni sayıya çevirir. decimal: arayüzün ondalık ayırıcısı ("." ya da ","). Yalnızca *diğer* ayırıcı ve üçlü gruplara benzeyen
 *  girdi ("1,000" / TR'de "1.000") binlik ayırıcı sayılıp reddedilir; arayüzün kendi ayırıcısıyla "12.345" ondalıktır. */
function readNumber(v, decimal = ".") {
  if (typeof v === "number") return Number.isFinite(v) ? { kind: "ok", n: v } : { kind: "bad" };
  const s = String(v ?? "").trim();
  if (s === "") return { kind: "empty" };
  const other = decimal === "." ? "," : ".";
  let t = s;
  if (s.includes(decimal) && s.includes(other)) {
    const dsep = s[Math.max(s.lastIndexOf(decimal), s.lastIndexOf(other))];
    const gsep = dsep === "." ? "," : ".";
    const [whole, ...rest] = s.split(dsep);
    const groups = whole.split(gsep);
    if (rest.length !== 1 || !/^[1-9]\d{0,2}$/.test(groups[0].replace(/^[+-]/, "")) || !groups.slice(1).every((g) => /^\d{3}$/.test(g))) return { kind: "bad" };
    t = groups.join("") + "." + rest[0];
  } else if (s.includes(other)) {
    if (new RegExp(`^[1-9]\\d{0,2}(\\${other}\\d{3})+$`).test(s)) return { kind: "sep" };
    t = s.replace(other, ".");
  } else {
    t = s.replace(decimal, ".");
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return { kind: "bad" };
  return { kind: "ok", n: Number(t) };
}
const ITEM_FIELDS = ["name", "hsCode", "qty", "unitPrice", "weightKg", "volumeM3", "dutyRate", "emyRate", "kkdfRate", "otherRate", "otherAmount", "otvRate"];
const isBlankItem = (r) => ITEM_FIELDS.every((f) => blank(r[f]));
const isBlankCost = (c) => blank(c.label) && blank(c.amount);

export function parseDraft(draft, { decimal = "." } = {}) {
  const errors = [];
  /** Metni sayıya çevirir; hata ekler. required ise boş da hatadır. */
  const num = (v, scope, id, field, { required = false, fallback = 0, key = "d.lc.err.num", positive = false } = {}) => {
    const r = readNumber(v, decimal);
    const bad = (k) => { errors.push({ scope, id, field, key: k }); return fallback; };
    if (r.kind === "empty") return required ? bad(key) : fallback;
    if (r.kind === "sep") return bad("d.lc.err.sep");
    if (r.kind === "bad" || r.n < 0 || (positive && r.n <= 0)) return bad(key);
    return r.n;
  };

  const rates = {};
  for (const cur of currenciesNeeded(draft)) { // kullanılmayan para biriminin eski kuru sonucu engellemez
    const text = draft.rates?.[cur];
    if (blank(text)) continue;
    rates[cur] = num(text, "rate", cur, "rate");
  }

  const items = draft.items.filter((r) => !isBlankItem(r)).map((r) => ({
    id: r.id, name: String(r.name || "").trim() || "Item", hsCode: String(r.hsCode || "").trim(),
    qty: num(r.qty, "item", r.id, "qty", { required: true, key: "d.lc.err.qty", positive: true }),
    unitPrice: num(r.unitPrice, "item", r.id, "unitPrice", { required: true }),
    weightKg: blank(r.weightKg) ? null : num(r.weightKg, "item", r.id, "weightKg", { fallback: null }),
    volumeM3: blank(r.volumeM3) ? null : num(r.volumeM3, "item", r.id, "volumeM3", { fallback: null }),
    dutyRate: num(r.dutyRate, "item", r.id, "dutyRate"), emyRate: num(r.emyRate, "item", r.id, "emyRate"),
    kkdfRate: num(r.kkdfRate, "item", r.id, "kkdfRate"), otherRate: num(r.otherRate, "item", r.id, "otherRate"),
    otherAmount: num(r.otherAmount, "item", r.id, "otherAmount"), otvRate: num(r.otvRate, "item", r.id, "otvRate"),
    vatRate: num(r.vatRate, "item", r.id, "vatRate")
  }));

  const costs = draft.costs.filter((c) => !isBlankCost(c)).map((c) => ({
    id: c.id, kind: c.kind, label: String(c.label || "").trim() || c.kind, currency: c.currency,
    amount: num(c.amount, "cost", c.id, "amount", { required: true }),
    included: (c.kind === "freight" || c.kind === "insurance") && !!c.included,
    alloc: ALLOC_KEYS.includes(c.alloc) ? c.alloc : "auto",
    vatRate: c.kind === "local" && !blank(c.vatRate) ? num(c.vatRate, "cost", c.id, "vatRate", { fallback: null }) : null
  }));

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    input: {
      currency: draft.currency, rates, incoterm: draft.incoterm,
      vatDeductible: !!draft.vatDeductible, kkdfInVat: !!draft.kkdfInVat, flatInsurance: !!draft.flatInsurance,
      items, costs
    }
  };
}
