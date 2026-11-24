/* Banka kartı düzenleme kuralı (saf mantık): kayıtlı bir kart değişmişse ya da kaybolmuşsa kaydetmeden önce "Emin misiniz?" sorulur.
   Yeni eklenen (henüz kayıtsız) kartlar onay istemez. */
const stable = (o) => JSON.stringify(Object.keys(o || {}).sort().map((k) => [k, o[k]]));

export const sameBank = (a, b) => stable(a) === stable(b);

export function touchesSaved(saved, shown) {
  const now = new Map((shown || []).map((x) => [x.id, x]));
  return (saved || []).some((s) => !now.has(s.id) || !sameBank(s, now.get(s.id)));
}
