/* Belge gereksinimleri: bir belge indirilmeden önce doldurulması zorunlu kalem alanları. Saf modül (DOM/React yok, testli).

   Yeni bir zorunluluk eklemek:
   - Yeni alan için RULES'a bir kural (hangi kalem alanı, hangi adımda/görünümde düzenlenir, uyarı metni anahtarı),
   - Hangi belge(ler) istiyorsa DOC_RULES'a o belgenin indirme türü → kural kimlikleri.
   Arayüz (uyarı ışığı, mesaj, boş hücre vurgusu, indirme engeli) bu iki tablodan kendiliğinden çıkar.

   Kullanıcı değeri bilmiyorsa ya da gerekmiyorsa alana "-" yazar: zorunluluk karşılanır, belgede boş basılır (forPrint). */

/** "Bilerek boş" işareti */
export const NA = "-";
export const isNA = (v) => String(v ?? "").trim() === NA;
const isBlank = (v) => String(v ?? "").trim() === "";

/** Kalem alanı kuralları. field: kalem alanı; step/view: düzenlendiği editör adımı ve kalem tablosu görünümü;
    msgKey: uyarı metni ({n} = eksik kalem sayısı, {docs} = isteyen belgeler) */
export const RULES = {
  hsCode: { field: "hsCode", step: "items", view: "invoice", msgKey: "d.req.hsCode" }
};

/** İndirme türü (download.js'teki kind) → zorunlu kurallar. xlsx: CI/FOC + packing list iki sayfalı Excel. */
export const DOC_RULES = {
  pl: ["hsCode"],
  xlsx: ["hsCode"]
};

export const docsForRule = (ruleId) => Object.keys(DOC_RULES).filter((k) => DOC_RULES[k].includes(ruleId));

/** Dolu kalem satırları (boş satırlar belgeye basılmaz, zorunluluk aranmaz) */
const realItems = (state) => (state?.items || []).filter((it) => it.description || it.qty);

function gap(state, ruleId) {
  const r = RULES[ruleId];
  const ids = realItems(state).filter((it) => isBlank(it[r.field])).map((it) => it.id);
  return ids.length ? { rule: ruleId, ids } : null;
}

/** Belge indirilebilir mi? Boş dizi = evet; aksi halde [{ rule, ids: eksik kalem kimlikleri }] */
export function checkDoc(state, kind) {
  return (DOC_RULES[kind] || []).map((id) => gap(state, id)).filter(Boolean);
}

/** Bir editör adımında düzenlenen ve en az bir belgenin istediği kuralların eksikleri (uyarı her zaman görünür) */
export function stepGaps(state, step) {
  const used = new Set(Object.values(DOC_RULES).flat());
  return Object.keys(RULES).filter((id) => used.has(id) && RULES[id].step === step).map((id) => gap(state, id)).filter(Boolean);
}

/** Eksikler → { alan: Set(kalem kimliği) } (kalem tablosunda boş hücreleri vurgulamak için) */
export function requiredCells(gaps) {
  const out = {};
  for (const g of gaps) {
    const f = RULES[g.rule].field;
    out[f] ||= new Set();
    for (const id of g.ids) out[f].add(id);
  }
  return out;
}

/** Basılacak durum: kural alanlarında "-" olan değerler boşaltılır. Değişiklik yoksa aynı nesne döner. */
export function forPrint(state) {
  if (!state?.items) return state;
  const fields = [...new Set(Object.values(RULES).map((r) => r.field))];
  if (!state.items.some((it) => fields.some((f) => isNA(it[f])))) return state;
  return {
    ...state,
    items: state.items.map((it) => {
      if (!fields.some((f) => isNA(it[f]))) return it;
      const c = { ...it };
      for (const f of fields) if (isNA(c[f])) c[f] = "";
      return c;
    })
  };
}
