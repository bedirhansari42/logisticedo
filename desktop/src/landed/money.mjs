/* Para yuvarlama ve kuruş paylaştırma. */

/** Ondalık değer üzerinde yarım yukarı (sıfırdan uzağa), Excel ROUND gibi. Önce 15 anlamlı basamağa temizler:
 *  2.425 ya da 1.21*48.5 gibi ikili kayan nokta gürültüsü sonucu bir kuruş şaşırtmasın. */
export const round = (v, d = 2) => {
  if (!Number.isFinite(v)) return v;
  const abs = Number(Math.abs(v).toPrecision(15));
  const s = String(abs);
  const r = s.includes("e") ? Math.round(abs * 10 ** d) / 10 ** d : Number(`${Math.round(Number(`${s}e${d}`))}e-${d}`);
  return v < 0 && r !== 0 ? -r : r;
};

/** total'ı ağırlıklarla paylaştırır; ilk n−1 öğe yuvarlanır, kalan kuruş son öğeye verilir (toplam her zaman tutar). */
export function allocate(total, weights) {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (!(sum > 0)) throw new RangeError("weights must sum to a positive number");
  const out = [];
  let used = 0;
  for (let i = 0; i < weights.length - 1; i++) {
    const v = round((total * weights[i]) / sum, 2);
    out.push(v);
    used += v;
  }
  out.push(round(total - used, 2));
  return out;
}
