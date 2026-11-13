/* İthalat maliyet hesabı (Türkiye). Saf fonksiyon: DOM yok, ağ yok. Şekiller için bkz. docs/superpowers/plans/2026-11-13-landed-cost.md */
import { round, allocate } from "./money.mjs";
import { INCOTERMS, DEFAULTS } from "./rules.mjs";

const err = (key, vars) => (vars ? { key, vars } : { key });
const sum = (a) => round(a.reduce((s, v) => s + v, 0), 2);
const rateOf = (input, cur) => (cur === "TRY" ? 1 : input.rates?.[cur]);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Paylaştırma ağırlıkları: anahtar için veri eksikse null. */
function weightsFor(key, items, goods) {
  const pick = { value: goods, qty: items.map((i) => i.qty), weight: items.map((i) => i.weightKg), volume: items.map((i) => i.volumeM3) }[key];
  if (!pick.every((v) => isNum(v) && v >= 0)) return null;
  return pick.reduce((s, v) => s + v, 0) > 0 ? pick : null;
}

/** "auto": tüm kalemlerde ağırlık varsa ağırlık, yoksa hacim, yoksa değer. */
function autoKey(items) {
  for (const key of ["weight", "volume"]) {
    const field = key === "weight" ? "weightKg" : "volumeM3";
    if (items.every((i) => isNum(i[field]) && i[field] > 0)) return key;
  }
  return "value";
}

export function calcLanded(input) {
  const items = input.items || [];
  const costs = input.costs || [];
  if (!items.length) return { ok: false, errors: [err("d.lc.err.noItems")] };

  const errors = [];
  for (const it of items) if (!(isNum(it.qty) && it.qty > 0)) errors.push(err("d.lc.err.qty", { name: it.name }));

  const isApplied = (c) => !((c.kind === "freight" || c.kind === "insurance") && c.included);
  const needRate = new Set([input.currency, ...costs.filter(isApplied).map((c) => c.currency)]);
  for (const cur of needRate) {
    const r = rateOf(input, cur);
    if (!(isNum(r) && r > 0)) errors.push(err("d.lc.err.rate", { currency: cur }));
  }
  if (errors.length) return { ok: false, errors };

  const goods = items.map((it) => round(it.qty * it.unitPrice * rateOf(input, input.currency), 2));
  const zeros = () => items.map(() => 0);
  const warnings = [];

  /** Bir tutarı kalemlere paylaştırır; veri eksikse hata ekler. Tutar 0 ise anahtar doğrulanmaz. */
  const share = (amountTry, key, label) => {
    const used = key === "auto" ? autoKey(items) : key;
    if (amountTry === 0) return { used, parts: zeros() };
    const w = weightsFor(used, items, goods);
    if (!w) { errors.push(err("d.lc.err.keyMissing", { label, key: used })); return { used, parts: zeros() }; }
    // "auto" bazı kalemlerde ağırlık/hacim varken değere ya da hacme düştüyse sessiz kalma
    const has = (f) => items.some((i) => isNum(i[f]) && i[f] > 0);
    if (key === "auto" && ((used !== "weight" && has("weightKg")) || (used === "value" && has("volumeM3")))) warnings.push(err("d.lc.warn.autoPartial", { label, key: used }));
    return { used, parts: allocate(amountTry, w) };
  };

  const freight = zeros(), insurance = zeros(), deduct = zeros(), local = zeros(), localVat = zeros();
  const into = (arr, parts) => parts.forEach((p, i) => { arr[i] = round(arr[i] + p, 2); });
  const lineOut = [];
  for (const c of costs) {
    const applied = isApplied(c);
    const amountTry = applied ? round((c.amount || 0) * rateOf(input, c.currency), 2) : 0;
    let usedKey = null;
    if (applied) {
      const s = share(amountTry, c.alloc, c.label);
      usedKey = s.used;
      if (c.kind === "local") {
        into(local, s.parts);
        const vat = round((amountTry * (c.vatRate || 0)) / 100, 2); // masraf KDV'si satır düzeyinde, aynı anahtarla paylaştırılır
        into(localVat, share(vat, s.used, c.label).parts);
      } else {
        into({ freight, insurance, deduct }[c.kind], s.parts);
      }
    }
    lineOut.push({ id: c.id, kind: c.kind, label: c.label, amountTry, usedKey, applied });
  }

  // Götürü sigorta: fiyata dahil değil, tutar girilmemiş ve anahtar açık
  const addedFreight = sum(lineOut.filter((l) => l.kind === "freight" && l.applied).map((l) => l.amountTry));
  const deducted = sum(lineOut.filter((l) => l.kind === "deduct").map((l) => l.amountTry));
  const flatBase = round(sum(goods) - deducted + addedFreight, 2);
  const hasInsurance = costs.some((c) => c.kind === "insurance" && c.amount > 0);
  const flatOn = !!input.flatInsurance && !INCOTERMS[input.incoterm]?.insurance && !hasInsurance;
  const flatAmount = flatOn ? round((flatBase * DEFAULTS.flatInsuranceRate) / 100, 2) : 0;
  if (flatOn) into(insurance, share(flatAmount, "value", "Flat insurance").parts);
  if (errors.length) return { ok: false, errors };

  for (let i = 0; i < items.length; i++) {
    if (round(goods[i] + freight[i] + insurance[i] - deduct[i], 2) < 0) errors.push(err("d.lc.err.negativeCif", { name: items[i].name }));
  }
  if (errors.length) return { ok: false, errors };

  const pct = (b, rate) => round((b * (rate || 0)) / 100, 2);
  const kkdfInVat = input.kkdfInVat !== false;
  const vatDeductible = input.vatDeductible !== false;
  const rows = items.map((it, i) => {
    const cif = round(goods[i] + freight[i] + insurance[i] - deduct[i], 2);
    const duty = pct(cif, it.dutyRate);
    const emy = pct(cif, it.emyRate);
    const kkdf = pct(cif, it.kkdfRate);
    const other = round((cif * (it.otherRate || 0)) / 100 + (it.otherAmount || 0), 2);
    const otv = pct(round(cif + duty + emy + other, 2), it.otvRate);
    const vatBase = round(cif + duty + emy + (kkdfInVat ? kkdf : 0) + other + otv, 2);
    const vat = pct(vatBase, it.vatRate);
    const landed = round(cif + duty + emy + kkdf + other + otv + local[i] + (vatDeductible ? 0 : vat + localVat[i]), 2);
    if (![it.dutyRate, it.emyRate, it.kkdfRate, it.otherRate, it.otherAmount, it.otvRate].some((v) => v > 0)) {
      warnings.push(err("d.lc.warn.noRates", { name: it.name }));
    }
    return {
      id: it.id, name: it.name, qty: it.qty,
      goods: goods[i], freight: freight[i], insurance: insurance[i], deduct: deduct[i], cif,
      duty, emy, kkdf, other, otv, vatBase, vat, local: local[i], localVat: localVat[i],
      landed, unitCost: round(landed / it.qty, 4)
    };
  });
  const total = (k) => sum(rows.map((r) => r[k]));
  const totals = {};
  for (const k of ["goods", "freight", "insurance", "deduct", "cif", "duty", "emy", "kkdf", "other", "otv", "vat", "local", "localVat", "landed"]) totals[k] = total(k);
  totals.cash = round(totals.duty + totals.emy + totals.kkdf + totals.other + totals.otv + totals.vat, 2);
  totals.recoverableVat = vatDeductible ? round(totals.vat + totals.localVat, 2) : 0;
  return {
    ok: true,
    items: rows,
    costs: lineOut,
    flatInsurance: { applied: flatOn, base: flatBase, amountTry: flatAmount },
    totals,
    warnings
  };
}
