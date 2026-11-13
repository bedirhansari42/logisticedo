# İthalat maliyet (landed cost) hesaplayıcı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Masaüstü uygulamasına, proforma kalemlerinden Türkiye ithalatı için kalem bazlı landed cost hesaplayan (CIF, vergiler, KDV, yurt içi masraflar), PDF ve formüllü Excel çıktısı veren bağımsız bir "Maliyet" sayfası eklemek.

**Architecture:** Saf (DOM'suz) hesap motoru `desktop/src/landed/*.mjs` içinde yaşar ve `node --test` ile test edilir; React sayfası taslağı metin alanlarıyla tutar, `parseDraft` ile sayıya çevirir, `calcLanded` ile hesaplar. PDF `pdf-lib` + IBM Plex Sans, Excel ExcelJS ile (ikisi de `deps` enjeksiyonlu, testler vendor dosyalarını kendisi verir). Proforma okuma mevcut `parseProforma` motorudur.

**Tech Stack:** React 19 + Vite (mevcut), Electron (mevcut), `node:test`, pdf-lib ve ExcelJS (vendor/). Yeni npm bağımlılığı yok.

**Spec:** `docs/superpowers/specs/2026-11-13-landed-cost-design.md`

**Not:** Kullanıcı git'i elle yönetiyor; planda commit adımı yok. Her görev bir doğrulama komutuyla biter. Node testleri `desktop/` klasöründen çalışır.

## Global Constraints

- Yeni npm bağımlılığı yok; veri cihazdan çıkmaz; dış ağ isteği, çevrimiçi oran/kur sorgusu yok. Araç hiçbir vergi oranını kendisi bilmez; oranlar kullanıcı girdisidir.
- Yalnızca Türkiye ithalatı; kurallar `rules.mjs` içinde ülke profili olarak durur.
- Hesap sırası (kalem başına, TRY): `goods` → `cif = goods + navlun payı + sigorta payı − düşülen pay` → `duty = cif×dutyRate%`, `emy = cif×emyRate%`, `kkdf = cif×kkdfRate%`, `other = cif×otherRate% + otherAmount` → `otvBase = cif + duty + emy + other`, `otv = otvBase×otvRate%` → `vatBase = cif + duty + emy + (kkdfInVat ? kkdf : 0) + other + otv`, `vat = vatBase×vatRate%` → `landed = cif + duty + emy + kkdf + other + otv + local + (vatDeductible ? 0 : vat + localVat)`.
- Her adım TRY'de iki ondalığa yuvarlanır (`round(v, 2)`); toplamlar yuvarlanmış kalem değerlerinin toplamıdır. Masraf paylaştırmasında kalan kuruş son kaleme verilir. Birim maliyet `round(landed / qty, 4)`.
- KKDF varsayılan olarak KDV matrahına dahildir (`kkdfInVat: true`, KDV Kanunu 21/b; resmî metinle doğrulanmadı, çıktıda formül yazılıdır).
- Sigorta fatura fiyatına dahil değilse ve sigorta tutarı girilmemişse ve `flatInsurance` açıksa: götürü sigorta = `round(3% × (Σgoods − Σdüşülen + Σfaturaya dahil olmayan navlun), 2)`; `DEFAULTS.flatInsuranceRate = 3`.
- D terimlerinde (DAP/DPU/DDP) Türkiye içi nakliye "düşülen" (`kind: "deduct"`) satırıyla girilir ve CIF'ten düşülür; DDP için yalnızca uyarı metni vardır.
- Çıktı belgeleri (PDF, Excel) İngilizce, antetsiz; PDF IBM Plex Sans (Inter + fontkit `subset:true` glifleri bozar). Excel uygulamayla birebir aynı sonucu verir: her adımda `ROUND(...,2)`, paylaştırmada son kalem = toplam − öncekilerin toplamı.
- TR + EN arayüz: anahtarlar `desktop/src/lib/strings.js`, önek `d.lc.`; `node scripts/check-i18n.mjs` geçmeli. Menüde yeni öğe `d.nav.landed`.
- Taslak `localStorage` anahtarı `lgx.landed`; her okuma/yazma try/catch içinde; kayıtlı hesap geçmişi yok.
- Auros teması: yeni stil yalnızca `desktop/src/styles/dash.css` içinde, mevcut sınıf ve değişkenlerle uyumlu.
- Sonuç ve çıktılarda "tahmini; oranlar kullanıcı girişidir, resmî hesap değildir" uyarısı bulunur.

## Review Focus

- Ondalık virgül ("1,5") kabul edilir; "1,000" gibi binlik ayırıcıya benzeyen girdi sessizce 1 sayılmaz, hata verir (Görev 4).
- Kullanılan bir para biriminin kuru girilmemiş ya da 0: hesap NaN üretmez, "kur gerekli" hatası verir (Görev 2).
- Bir paylaştırma anahtarı için veri eksik (ör. ağırlığa göre paylaştırmada bir kalemin ağırlığı boş) ya da toplam ağırlık 0: bölme hatası/NaN yok, anahtar adıyla hata (Görev 2).
- Tüm oranlar boş kalem: vergi 0 sayılır, "oran girilmedi" uyarısı çıkar, çökme yok (Görev 3).
- Proforma aktarımında fiyatı okunamayan kalem, boş kalem listesi ya da farklı para birimli kalem: satır eklenir/uyarılır, mevcut taslak sessizce silinmez (Görev 5).

---

## Dosya yapısı

| Dosya | Sorumluluk |
|---|---|
| `desktop/src/landed/rules.mjs` | Incoterm tablosu, paylaştırma anahtarları, varsayılanlar, para birimleri |
| `desktop/src/landed/money.mjs` | `round`, `allocate` |
| `desktop/src/landed/calc.mjs` | `calcLanded(input)`: tüm hesap |
| `desktop/src/landed/model.mjs` | Taslak satırları, `loadDraft/saveDraft`, `parseDraft`, `currenciesNeeded` |
| `desktop/src/landed/proforma.mjs` | `applyParseToDraft(draft, res)` |
| `desktop/src/landed/xlsx.mjs` | `buildLandedXlsx(input, result, deps)` |
| `desktop/src/landed/xl-eval.mjs` | Yalnızca test için küçük formül değerlendirici |
| `desktop/src/landed/pdf.mjs` | `buildLandedPdf(input, result, deps)` |
| `desktop/src/landed/*.test.mjs` | Testler (modül başına bir dosya) |
| `desktop/src/pages/Landed.jsx` + `desktop/src/components/landed/*.jsx` | Sayfa |
| Değişenler: `planner/items.mjs`, `App.jsx`, `router.js`, `Sidebar.jsx`, `Icons.jsx`, `strings.js`, `dash.css`, `package.json`, `README.md` | |

## Ortak veri şekilleri

Görevler arasında tek doğru kaynak budur.

```js
// calc girdisi (sayılar; metin değil)
input = {
  currency: "USD",                // fatura para birimi
  rates: { USD: 30 },             // 1 birim = kaç TRY; "TRY" her zaman 1
  incoterm: "FOB",
  vatDeductible: true, kkdfInVat: true, flatInsurance: true,
  items: [{ id, name, hsCode, qty, unitPrice, weightKg, volumeM3,   // weightKg/volumeM3: kalemin TOPLAMI, yoksa null
            dutyRate, emyRate, kkdfRate, otherRate, otherAmount,     // oranlar %; otherAmount TRY; boş = 0
            otvRate, vatRate }],
  costs: [{ id, kind, label, amount, currency, included, alloc, vatRate }]
  // kind: "freight" | "insurance" | "deduct" | "local"
  // included: yalnızca freight/insurance; true ise fatura fiyatına dahil, hesaba katılmaz
  // alloc: "auto" | "value" | "weight" | "volume" | "qty"; vatRate: yalnızca local (yüzde ya da null)
}

// calc sonucu
{ ok: true,
  items: [{ id, name, qty, goods, freight, insurance, deduct, cif, duty, emy, kkdf, other, otv, vatBase, vat, local, localVat, landed, unitCost }],
  costs: [{ id, kind, label, amountTry, usedKey, applied }],      // usedKey: kullanılan anahtar; applied: false ise "faturaya dahil", hesaba girmedi
  flatInsurance: { applied: boolean, base: number, amountTry: number },
  totals: { goods, freight, insurance, deduct, cif, duty, emy, kkdf, other, otv, vat, local, localVat, landed,
            cash,            // gümrükte ödenecek: duty+emy+kkdf+other+otv+vat
            recoverableVat }, // vatDeductible ? vat + localVat : 0
  warnings: [{ key, vars? }] }
| { ok: false, errors: [{ key, vars? }] }
```

---

### Task 1: Temel modüller (kurallar, para, paylaştırma)

**Files:**
- Create: `desktop/src/landed/rules.mjs`, `desktop/src/landed/money.mjs`, `desktop/src/landed/money.test.mjs`
- Modify: `desktop/src/planner/items.mjs` (`read` fonksiyonunu `export` et), `desktop/package.json` (`"test:landed": "node --test src/landed/*.test.mjs"`)

**Interfaces:**
- Produces: `rules.mjs`: `INCOTERMS: Record<string,{freight:boolean,insurance:boolean,delivered?:boolean,dutyPaid?:boolean}>`, `defaultIncluded(incoterm: string, kind: "freight"|"insurance"): boolean`, `ALLOC_KEYS = ["auto","value","weight","volume","qty"]`, `CURRENCIES = ["USD","EUR","GBP","CNY","TRY"]`, `DEFAULTS = { vatRate: 20, flatInsuranceRate: 3 }`. `money.mjs`: `round(v: number, d = 2): number`, `allocate(total: number, weights: number[]): number[]` (Σ ağırlık ≤ 0 ise `RangeError`). `items.mjs`: `read(v): {kind:"ok",n}|{kind:"empty"}|{kind:"sep"}|{kind:"bad"}`.

- [ ] **Step 1: `money.test.mjs` yaz**

```js
test("round is half-up with epsilon", () => assert.equal(round(1.005, 2), 1.01));
test("allocate gives the remainder to the last item", () => assert.deepEqual(allocate(100, [1, 1, 1]), [33.33, 33.33, 33.34]));
test("allocate sums to the total", () => { const a = allocate(0.01, [1, 1]); assert.deepEqual(a, [0.01, 0]); });
test("allocate by uneven weights", () => assert.deepEqual(allocate(18000, [100, 300]), [4500, 13500]));
test("allocate rejects zero total weight", () => assert.throws(() => allocate(10, [0, 0]), RangeError));
```
`rules` için: `defaultIncluded("CIF","insurance") === true`, `defaultIncluded("FOB","freight") === false`, `defaultIncluded("CFR","freight") === true`, `defaultIncluded("CFR","insurance") === false`, `INCOTERMS.DDP.dutyPaid === true`; `INCOTERMS` anahtarları `@engine/parse/normalize.js`'teki 11 Incoterm'le aynı küme (testte dosyayı göreli yolla okuyup `INCOTERMS` dizisini regex ile çıkar ya da 11 adı elle listele).

- [ ] **Step 2:** `cd desktop && node --test src/landed/money.test.mjs` → FAIL (modül yok).
- [ ] **Step 3:** `money.mjs` ve `rules.mjs` yaz. `round`: `Math.round((v + Number.EPSILON) * 10**d) / 10**d`. `allocate`: ilk n−1 öğe `round(total×w/Σw)`, son = `round(total − Σönceki)`. `INCOTERMS`: EXW/FCA/FAS/FOB `{false,false}`; CFR/CPT `{freight:true,insurance:false}`; CIF/CIP `{true,true}`; DAP/DPU `{freight:true,insurance:false,delivered:true}`; DDP aynı + `dutyPaid:true`. `items.mjs`'te yalnızca `function read` → `export function read`.
- [ ] **Step 4:** `npm run test:landed` ve `npm run test:planner` → hepsi PASS (planlayıcı testleri bozulmamalı).

---

### Task 2: Hesap motoru — doğrulama ve CIF aşaması

**Files:**
- Create: `desktop/src/landed/calc.mjs`, `desktop/src/landed/calc.test.mjs`

**Interfaces:**
- Consumes: `round`, `allocate` (`money.mjs`); `INCOTERMS`, `ALLOC_KEYS`, `DEFAULTS` (`rules.mjs`).
- Produces: `calcLanded(input): Result` (şekil "Ortak veri şekilleri"). Bu görev sonunda `items[i]` içinde `goods, freight, insurance, deduct, cif`, `costs[]`, `flatInsurance`, `totals.{goods,freight,insurance,deduct,cif}` doludur; vergi alanları Görev 3'te eklenir.

- [ ] **Step 1: Testleri yaz.** Ortak örnek `S1`: `currency "USD"`, `rates {USD:30}`, `incoterm "FOB"`, kalemler A (`qty 10, unitPrice 100, weightKg 100`) ve B (`qty 5, unitPrice 200, weightKg 300`); masraflar: navlun 600 USD `alloc "weight"`, sigorta 100 USD `alloc "value"`.

```js
test("S1 CIF: goods + freight by weight + insurance by value", () => {
  const r = calcLanded(S1);
  assert.deepEqual(r.items.map(i => [i.goods, i.freight, i.insurance, i.cif]), [[30000, 4500, 1500, 36000], [30000, 13500, 1500, 45000]]);
  assert.equal(r.flatInsurance.applied, false);
});
test("flat insurance 3% of goods + added freight when no insurance line", () => {
  // S1 without the insurance line
  assert.deepEqual(r.flatInsurance, { applied: true, base: 78000, amountTry: 2340 });
  assert.deepEqual(r.items.map(i => i.cif), [35670, 44670]);
});
test("flat insurance base excludes freight when no freight line", () => assert.equal(r.flatInsurance.amountTry, 1800)); // iki kalem, navlunsuz
test("CIF incoterm: nothing is added and no flat insurance", () => { /* incoterm "CIF", navlun/sigorta satırı yok */ assert.deepEqual(r.items.map(i => i.cif), [30000, 30000]); assert.equal(r.flatInsurance.applied, false); });
test("included freight line is ignored in CIF and in flat base", () => { /* navlun satırı included:true, FOB */ assert.equal(r.costs[0].applied, false); assert.equal(r.flatInsurance.base, 60000); });
test("DAP: deduct line lowers goods before flat insurance", () => {
  // DAP, deduct 6000 TRY alloc value, flatInsurance açık
  assert.equal(r.flatInsurance.amountTry, 1620);
  assert.deepEqual(r.items.map(i => i.cif), [27810, 27810]);
});
test("flat insurance off adds nothing", () => assert.equal(r.flatInsurance.applied, false));
test("auto allocation: weight, then volume, then value", () => { /* A,B ağırlıklı: usedKey "weight"; birinin ağırlığı null, hacimleri var: "volume"; ikisi de yok: "value" */ });
test("explicit key with missing data is an error naming the key", () => {
  assert.deepEqual(r, { ok: false, errors: [{ key: "d.lc.err.keyMissing", vars: { label: "Freight", key: "weight" } }] });
});
test("missing or zero exchange rate is an error, never NaN", () => {
  assert.equal(r.ok, false); assert.equal(r.errors[0].key, "d.lc.err.rate"); assert.deepEqual(r.errors[0].vars, { currency: "EUR" });
});
test("item with qty 0 is an error", () => assert.equal(r.errors[0].key, "d.lc.err.qty"));
test("no items is an error", () => assert.equal(r.errors[0].key, "d.lc.err.noItems"));
```

- [ ] **Step 2:** `node --test src/landed/calc.test.mjs` → FAIL.
- [ ] **Step 3: `calcLanded(input)` yaz.** Önce doğrulama (kalem yok, qty ≤ 0 ya da sayı değil, kullanılan para birimi için kur yok/≤0 → `ok:false` + `errors`; hata anahtarları `d.lc.err.noItems|qty|rate|keyMissing`), sonra `goods_i = round(qty×unitPrice×rate, 2)`. Masraf TRY tutarı `round(amount×rate(currency), 2)`. Anahtar ağırlıkları: `value`→goods, `weight`→weightKg, `volume`→volumeM3, `qty`→qty; `auto`: tüm kalemlerde weight>0 ise weight, yoksa volume>0 ise volume, yoksa value. Açık anahtarda herhangi bir kalem verisi null/≤0 ise `keyMissing`. `freight`/`insurance` satırı `included:true` ise `applied:false`, paylaştırılmaz. `deduct` hep uygulanır. Götürü sigorta koşulu: `flatInsurance` açık **ve** `!INCOTERMS[incoterm].insurance` **ve** uygulanan/dahil işaretli hiçbir sigorta satırında amount > 0 yok; tutar `round(rate% × base)`, paylaştırma anahtarı `value`. `cif_i = round(goods + freight + insurance − deduct, 2)`.
- [ ] **Step 4:** `npm run test:landed` → PASS.

---

### Task 3: Hesap motoru — vergiler, yurt içi masraflar, toplamlar

**Files:**
- Modify: `desktop/src/landed/calc.mjs`, `desktop/src/landed/calc.test.mjs`

**Interfaces:**
- Consumes: Görev 2'nin `calcLanded` iskeleti.
- Produces: `items[i].{duty,emy,kkdf,other,otv,vatBase,vat,local,localVat,landed,unitCost}`, `totals.*` (tümü), `warnings`.

- [ ] **Step 1: Testleri ekle.**

```js
test("S1 full chain: duty, VAT, local cost, landed, totals", () => {
  // S1 + yerel masraf: kind "local", 1000 TRY, alloc "value", vatRate 20, vatDeductible true
  const r = calcLanded(S1_LOCAL);
  assert.deepEqual(r.items.map(i => [i.duty, i.vatBase, i.vat, i.local, i.landed, i.unitCost]),
    [[3600, 39600, 7920, 500, 40100, 4010], [0, 45000, 9000, 500, 45500, 9100]]);
  assert.deepEqual([r.totals.landed, r.totals.cash, r.totals.recoverableVat, r.totals.localVat], [85600, 20520, 17120, 200]);
});
test("VAT not deductible is added to landed cost", () => {
  assert.deepEqual(r.items.map(i => i.landed), [48120, 54600]);
  assert.deepEqual([r.totals.landed, r.totals.recoverableVat], [102720, 0]);
});
test("tax chain with EMY, KKDF, other duty, OTV", () => {
  // tek kalem, currency "TRY", qty 1, unitPrice 1000, incoterm "CIF"; dutyRate 10, emyRate 5, kkdfRate 6, otherRate 2, otherAmount 30, otvRate 10, vatRate 20
  assert.deepEqual([i.duty, i.emy, i.kkdf, i.other, i.otv, i.vatBase, i.vat], [100, 50, 60, 50, 120, 1380, 276]);
});
test("kkdfInVat false removes KKDF from the VAT base", () => assert.deepEqual([i.vatBase, i.vat], [1320, 264]));
test("blank rates give zero tax and one warning per item", () => {
  assert.deepEqual(r.warnings, [{ key: "d.lc.warn.noRates", vars: { name: "A" } }]);
  assert.equal(r.items[0].landed, r.items[0].cif);
});
test("grand totals equal the sum of rounded item values", () => { /* 7 kalemli, bölünemeyen tutarlı örnek */ for (const k of ["cif","duty","vat","landed"]) assert.equal(r.totals[k], round(r.items.reduce((s,i)=>s+i[k],0), 2)); });
test("unit cost has four decimals", () => assert.equal(i.unitCost, 33.3333)); // landed 100, qty 3
```
Yerel masraf `vatRate` boş/null ise `localVat` 0.

- [ ] **Step 2:** `node --test src/landed/calc.test.mjs` → yeni testler FAIL.
- [ ] **Step 3:** Vergi zincirini "Global Constraints"taki formülle, her adımda `round(..., 2)` ile uygula. `local` masraflar `allocate` ile (anahtar kuralları Görev 2'deki gibi, varsayılan `value`); masraf satırının KDV'si `round(amountTry × vatRate/100, 2)` satır düzeyinde hesaplanır ve aynı ağırlıklarla kalemlere paylaştırılır (`localVat`). `warnings`: tüm oran alanları (duty, emy, kkdf, other, otherAmount, otv) 0/boş olan kalem için `d.lc.warn.noRates`. `unitCost = round(landed/qty, 4)`. `totals` kalem değerlerinin yuvarlanmış toplamıdır; `cash`, `recoverableVat` Ortak veri şekilleri'ndeki gibi.
- [ ] **Step 4:** `npm run test:landed` → PASS.

---

### Task 4: Taslak modeli ve girdi ayrıştırma

**Files:**
- Create: `desktop/src/landed/model.mjs`, `desktop/src/landed/model.test.mjs`

**Interfaces:**
- Consumes: `read` (`planner/items.mjs`), `defaultIncluded`, `DEFAULTS`, `CURRENCIES` (`rules.mjs`).
- Produces:
  - `DRAFT_KEY = "lgx.landed"`
  - `newItemRow(vatRate?: string): ItemRow` — alanlar: `id, name, hsCode, qty, unit ("PCS"), unitPrice, weightKg, volumeM3, dutyRate, emyRate, kkdfRate, otherRate, otherAmount, otvRate, vatRate` (hepsi metin).
  - `newCostRow(kind, draft): CostRow` — `id, kind, label, amount, currency (draft.currency), included (freight/insurance için defaultIncluded(draft.incoterm, kind), diğerleri false), alloc ("auto" navlun için, "value" diğerleri), vatRate (local için draft.defaultVatRate, diğerleri "")`.
  - `defaultDraft(): Draft` — `{ currency:"USD", rates:{}, incoterm:"FOB", vatDeductible:true, kkdfInVat:true, flatInsurance:true, defaultVatRate:"20", items:[newItemRow("20")], costs:[] }` (`rates` metin: `{USD:"30"}`).
  - `loadDraft(): Draft`, `saveDraft(d): void` (bozuk/eksik veride `defaultDraft()`; geçersiz `incoterm`/`currency` varsayılana düşer; satırlar `newItemRow/newCostRow` ile birleştirilir; try/catch).
  - `parseDraft(draft): { ok: true, input } | { ok: false, errors: [{ scope: "item"|"cost"|"rate"|"general", id?, field, key }] }` — tamamen boş satırlar atlanır; oran alanları boşsa 0; kalem `qty` ve `unitPrice` zorunlu; ağırlık/hacim boşsa `null`; negatifler ve sayı olmayanlar hata; hata anahtarları `d.lc.err.num|qty|sep`.
  - `currenciesNeeded(draft): string[]` — fatura para birimi + masraf satırlarındaki para birimleri, `TRY` hariç, tekrarsız.

- [ ] **Step 1: Testleri yaz.**

```js
test("comma decimal is accepted", () => assert.equal(parseDraft(d({ qty: "1,5", unitPrice: "2,25" })).input.items[0].qty, 1.5));
test("1,000 is rejected as ambiguous", () => assert.deepEqual(parseDraft(d({ qty: "1,000" })).errors[0], { scope: "item", id: ITEM_ID, field: "qty", key: "d.lc.err.sep" }));
test("blank rows are skipped, blank rates become 0", () => { assert.equal(r.input.items.length, 1); assert.equal(r.input.items[0].dutyRate, 0); assert.equal(r.input.items[0].weightKg, null); });
test("negative and non-numeric values are errors", () => { /* unitPrice "-1", dutyRate "abc" */ });
test("rates are parsed into numbers, TRY is not required", () => assert.deepEqual(currenciesNeeded(draftWithEurFreight), ["USD", "EUR"]));
test("loadDraft survives corrupt storage", () => { globalThis.localStorage = { getItem: () => "{bad", setItem() {} }; assert.deepEqual(loadDraft().items.length, 1); });
test("new freight row follows the incoterm", () => { assert.equal(newCostRow("freight", { ...defaultDraft(), incoterm: "CFR" }).included, true); assert.equal(newCostRow("freight", defaultDraft()).included, false); });
test("parseDraft output feeds calcLanded", () => { assert.equal(calcLanded(parseDraft(sample).input).ok, true); });
```

- [ ] **Step 2:** `node --test src/landed/model.test.mjs` → FAIL.
- [ ] **Step 3:** `model.mjs` yaz (`uid` yaklaşımı `planner/items.mjs` ile aynı; sayı okuma `read` ile).
- [ ] **Step 4:** `npm run test:landed` → PASS.

---

### Task 5: Proforma aktarımı

**Files:**
- Create: `desktop/src/landed/proforma.mjs`, `desktop/src/landed/proforma.test.mjs`

**Interfaces:**
- Consumes: `Draft`, `newItemRow`, `newCostRow` (`model.mjs`); `INCOTERMS`, `CURRENCIES` (`rules.mjs`). `parseProforma` sonucu `res`: `res.meta.currency`, `res.shipment.incoterm`, `res.charges.{freight,insurance}`, `res.items[]` (`code, description, hsCode, qty, unit, unitPrice, amount, netWeight, grossWeight, volume, currency`; sayı ya da `null`).
- Produces: `applyParseToDraft(draft: Draft, res): { draft: Draft, warnings: [{ key: string, vars?: object }] }` — girdiyi değiştirmez.

- [ ] **Step 1: Testleri yaz** (`res` elle kurulmuş nesneler; ayrıştırıcı çalıştırılmaz).

```js
test("maps items, currency and incoterm", () => { /* qty 10, unitPrice 5, hsCode "8501", description "Motor" */ assert.deepEqual([it.name, it.qty, it.unitPrice, it.hsCode], ["Motor", "10", "5", "8501"]); assert.equal(out.draft.currency, "EUR"); assert.equal(out.draft.incoterm, "CIF"); });
test("unitPrice is derived from amount when missing", () => assert.equal(it.unitPrice, "2.5")); // amount 25, qty 10
test("item without any price is kept blank and warned", () => assert.deepEqual(out.warnings, [{ key: "d.lc.warn.noPrice", vars: { name: "Motor" } }]));
test("weight prefers gross over net; volume carried", () => assert.deepEqual([it.weightKg, it.volumeM3], ["120", "0.5"]));
test("charges become cost rows following the incoterm", () => { /* freight 600, FOB */ assert.deepEqual([c.kind, c.amount, c.included], ["freight", "600", false]); });
test("empty item list keeps the current draft and warns", () => { assert.deepEqual(out.draft.items, draft.items); assert.equal(out.warnings[0].key, "d.lc.warn.noItems"); });
test("items in another currency are warned, not converted", () => assert.equal(out.warnings[0].key, "d.lc.warn.mixedCurrency"));
test("unsupported currency or incoterm leaves the draft value", () => { assert.equal(out.draft.currency, "USD"); });
test("input draft is not mutated", () => assert.deepEqual(draft, snapshot));
```
Sayı → metin: ondalık nokta (`String(n)`), `model.parseDraft` hem virgül hem nokta okur.

- [ ] **Step 2:** `node --test src/landed/proforma.test.mjs` → FAIL.
- [ ] **Step 3:** `applyParseToDraft` yaz. Mevcut serbest satırlar yerine aktarılan kalemler geçer (kalem listesi boşsa taslak korunur). Navlun/sigorta `res.charges` > 0 ise ilgili `kind` satırı eklenir (para birimi = `res.meta.currency`), mevcut aynı `kind` satırı varsa değiştirilmez.
- [ ] **Step 4:** `npm run test:landed` → PASS.

---

### Task 6: Excel çıktısı (formüllü) ve test değerlendiricisi

**Files:**
- Create: `desktop/src/landed/xl-eval.mjs`, `desktop/src/landed/xlsx.mjs`, `desktop/src/landed/xlsx.test.mjs`

**Interfaces:**
- Consumes: `calcLanded` sonucu ve `input` (Ortak veri şekilleri).
- Produces:
  - `buildLandedXlsx(input, result, deps?): Promise<Uint8Array|ArrayBuffer>` — `deps = { ExcelJS }`; verilmezse `loadExcelJS()` (`@engine/loader.js`, dinamik içe aktarma). İki sayfa: `Inputs` (kurlar, anahtarlar, masraf satırları, uyarı notu) ve `Calculation` (kalem başına sütunlar, toplam satırı; oranlar ve kurlar hücre, hesaplar canlı formül). Her formül hücresi `{ formula, result }` olarak `result`'taki sayıyı da taşır.
  - `xl-eval.mjs`: `evalWorkbook(workbook): (sheet: string, ref: string) => number|string|boolean` — yalnızca `+ - * / ( )`, karşılaştırmalar, `ROUND, SUM, IF, MAX, MIN, AND, OR, ABS`, `Sheet!A1` ve `A1:B2` aralıklarını destekler; önbellek `result`'ı **kullanmaz**, formülü yeniden hesaplar.

- [ ] **Step 1: Testleri yaz.** `deps = { ExcelJS: createRequire(import.meta.url)(vendor/exceljs.min.js) }`.

```js
test("evaluator basics", () => { /* ROUND(2.345*10,2), SUM(A1:A3), IF(A1>1,5,6), Sheet!B2 */ });
test("evaluated Calculation matches calcLanded for every scenario", async () => {
  for (const [name, input] of SCENARIOS) {            // S1 tam zincir, KDV indirilemez, KKDF KDV dışı, DAP+düşülen+götürü sigorta, 3 kalemli bölünemeyen tutar
    const result = calcLanded(input);
    const wb = await loadBack(await buildLandedXlsx(input, result, deps));
    const cell = evalWorkbook(wb);
    // Calculation sayfasında "TOTAL" etiketli satırdaki değerler, başlık satırındaki sütun adlarıyla (cif, duty, ..., landed) eşlenir
    for (const k of ["cif","duty","emy","kkdf","other","otv","vat","local","landed"]) assert.equal(totalCell(cell, wb, k), result.totals[k], `${name}:${k}`);
    result.items.forEach((it, i) => assert.equal(itemCell(cell, wb, i, "landed"), it.landed, `${name}:item${i}`));
  }
});
test("changing a rate in Inputs changes the evaluated result", async () => { /* kur hücresini 30 → 31 yap; evalWorkbook toplam landed ≠ eski */ });
test("workbook has the disclaimer and no external references", () => { /* Inputs'ta "estimate" notu; hiçbir formülde '[' ya da http yok */ });
test("workbook with no cost lines still builds", async () => {});
```

- [ ] **Step 2:** `node --test src/landed/xlsx.test.mjs` → FAIL.
- [ ] **Step 3:** `xl-eval.mjs` yaz (formülü JS ifadesine çevir: aralık/başvuru → `RNG()/REF()` çağrıları, `<>`→`!==`, `=`→`===`, fonksiyon tablosu; hücre bazında önbellekli özyineleme). Sonra `xlsx.mjs`: Inputs'ta her masraf satırı için TRY tutarı (`=ROUND(amount*rate,2)`); Calculation'da her kalem satırı için goods, her masraf için paylaşım sütunu (`ROUND(total*w/SUM(w),2)`, son kalem `total − SUM(önceki)`), cif, vergiler ve landed formülleri. Sütun başlıkları İngilizce ve test eşlemesi için `result.items` alan adlarıyla aynıdır. Para biçimi `#,##0.00`; sayfa kurulumu `excel-builder.js`'teki `setup()` düzenine benzer (A4, ızgara çizgisi kapalı).
- [ ] **Step 4:** `npm run test:landed` → PASS.

---

### Task 7: PDF çıktısı

**Files:**
- Create: `desktop/src/landed/pdf.mjs`, `desktop/src/landed/pdf.test.mjs`

**Interfaces:**
- Consumes: `input`, `calcLanded` sonucu.
- Produces: `buildLandedPdf(input, result, deps?): Promise<Uint8Array>` — `deps = { PDFLib, fontkit, fonts: [Regular, SemiBold, Bold] }` (verilmezse `@engine/loader.js` `loadPdfLib` + `loadDocFonts`, `planner/pdf.mjs`'deki `defaultDeps` gibi). A4, İngilizce, antetsiz. İçerik: başlık, giriş özeti (fatura para birimi, kurlar, Incoterm, anahtarlar, götürü sigorta), masraflar ve kullanılan paylaştırma anahtarı, kalem tablosu (CIF, vergiler, landed, unit cost), toplamlar (cash at customs, recoverable VAT, landed total), formül açıklaması ve "Estimate — rates entered by the user; not a customs calculation" uyarısı. `result.ok` değilse `Error("nothing to export")` fırlatır.

- [ ] **Step 1: Testleri yaz** (`planner/pdf.test.mjs`'in `deps` kurulumunu aynen kullan).

```js
test("builds a PDF for a valid result", async () => { assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-"); assert.ok((await pageCount(bytes)) >= 1); });
test("120 items paginate", async () => assert.ok((await pageCount(bytes)) >= 2));
test("characters the font cannot draw do not break the export", async () => { /* kalem adı "漢字 motor 🚚" */ });
test("refuses an invalid result", async () => assert.rejects(() => buildLandedPdf(input, { ok: false, errors: [] }, deps), /nothing to export/));
```

- [ ] **Step 2:** `node --test src/landed/pdf.test.mjs` → FAIL.
- [ ] **Step 3:** `pdf.mjs` yaz; `planner/pdf.mjs`'teki `safe()` (glif yoksa `?`), `fit()` ve `table()` yaklaşımını yeniden kullan; ortak yardımcıyı **çıkarma**, yalnızca gerekirse küçük kopyala (planlayıcı koduna dokunma).
- [ ] **Step 4:** `npm run test:landed` → PASS.

---

### Task 8: Sayfa, menü, çeviriler ve canlı sonuç

**Files:**
- Create: `desktop/src/pages/Landed.jsx`, `desktop/src/components/landed/ItemsTable.jsx`, `desktop/src/components/landed/CostsTable.jsx`, `desktop/src/components/landed/ResultView.jsx`
- Modify: `desktop/src/App.jsx` (`case "landed"`), `desktop/src/lib/router.js` (`#/landed`), `desktop/src/components/Sidebar.jsx` (NAV'a `["landed", "/landed", "landed", "d.nav.landed"]`), `desktop/src/components/Icons.jsx` (`landed` simgesi), `desktop/src/lib/strings.js` (TR+EN, önek `d.lc.` ve `d.nav.landed`), `desktop/src/styles/dash.css`

**Interfaces:**
- Consumes: `loadDraft/saveDraft/parseDraft/newItemRow/newCostRow/currenciesNeeded` (`model.mjs`), `calcLanded` (`calc.mjs`), `INCOTERMS/ALLOC_KEYS/CURRENCIES` (`rules.mjs`).
- Produces: `Landed()` sayfası; `ItemsTable({rows, onChange, errors})`, `CostsTable({rows, draft, onChange, errors})`, `ResultView({result, input})`.

- [ ] **Step 1:** Yönlendirme, menü, simge ve `Landed` iskeletini ekle; `npm run build` ile derlendiğini doğrula.
- [ ] **Step 2:** Sayfa: üstte genel ayarlar (fatura para birimi, Incoterm, `vatDeductible`/`kkdfInVat`/`flatInsurance` anahtarları, varsayılan KDV oranı, `currenciesNeeded` için kur alanları); kalem tablosu (satır ekle/çoğalt/sil, `planner/Planner.jsx`'teki gibi, yatay kaydırmalı ızgara); masraf tablosu (dört tür: navlun, sigorta, Türkiye içi nakliye (düşülen), yurt içi masraf; navlun/sigorta için "faturaya dahil", paylaştırma anahtarı seçici); DDP ve D terimleri için uyarı notu. Taslak `useEffect` ile `saveDraft`. Sonuç `parseDraft` → `calcLanded` ile canlı hesaplanır; hata varsa satır/alan hataları gösterilir, sonuç alanı boş kalır.
- [ ] **Step 3:** `ResultView`: kalem tablosu (CIF, vergiler, landed, birim maliyet), toplamlar (gümrükte ödenecek, indirilebilir KDV, KDV hariç landed), uyarılar ve "tahmini; oranlar kullanıcı girişidir" notu. İngilizce/Türkçe tüm metinler `t("d.lc....")` ile.
- [ ] **Step 4: Doğrulama.** Komutlar: `cd desktop && node scripts/check-i18n.mjs` (hatasız), `npm run build` (hatasız), `npm run test:landed` ve `npm run test:planner` (PASS). Elle: uygulamayı başlat (`npm run electron` ya da `npm run dev`), `#/landed` aç; Görev 3'teki `S1_LOCAL` değerlerini gir ve sonucun `landed 85600`, `cash 20520`, `recoverable VAT 17120` olduğunu gör. Yöntem için bkz. başsız Chrome ile UI doğrulama notu (CDP; `/review/i` gibi gevşek düğme eşleşmelerine dikkat; test sonrası `~/Library/Application Support/logisticedo` silinmeli).

---

### Task 9: Proforma içe aktarma, indirme düğmeleri ve belgeler

**Files:**
- Modify: `desktop/src/pages/Landed.jsx`, `desktop/src/lib/strings.js`, `desktop/README.md`, `README.md`

**Interfaces:**
- Consumes: `parseProforma` (`@engine/parse/index.js`), `applyParseToDraft` (`proforma.mjs`), `buildLandedXlsx`, `buildLandedPdf`, `saveBlob` (`lib/download.js`), `Dropzone`, `ParseReport/buildParseSummary` (`components/`), `toast` (`@common`).

- [ ] **Step 1:** Sayfaya `Dropzone` ekle: dosya → `parseProforma(file)` → `applyParseToDraft(draft, res)`; uyarılar `ParseReport` stilinde gösterilir; mevcut kalemler doluysa içe aktarmadan önce onay iste (sessizce silme yok). Okuma hatası kullanıcıya gösterilir, taslak değişmez.
- [ ] **Step 2:** İki indirme düğmesi: PDF (`Landed-Cost_<tarih>.pdf`) ve Excel (`Landed-Cost_<tarih>.xlsx`); sonuç geçersizse devre dışı; üretim sırasında `Spinner`; hata `toast` ile.
- [ ] **Step 3:** `desktop/README.md`'ye `#/landed` bölümü ve `npm run test:landed` ekle; kök `README.md`'de araç listesine bir satır ekle.
- [ ] **Step 4: Doğrulama.** `cd desktop && npm run test:landed && npm run test:planner && node scripts/check-i18n.mjs && npm run build` hepsi hatasız. Elle: `test_document/Proforma Fatura.pdf` dosyasını bırak; kalemler dolar, oran alanları boş kalıp uyarı çıkar; PDF ve Excel indir; Excel'i aç, kur hücresini değiştir, toplamın güncellendiğini gör.

---

## Self-Review

- **Spec kapsamı:** CIF/Incoterm/D terimi/götürü sigorta (G2), vergi zinciri, KKDF anahtarı, diğer vergi, ÖTV, yurt içi masraf KDV'si, yuvarlama, birim maliyet (G3), taslak ve girdi doğrulama (G4), proforma aktarımı (G5), Excel birebir uyum (G6), PDF (G7), sayfa/menü/TR-EN (G8), indirme ve belge (G9). "Oran hatırlama" ve diğer ülkeler spec'te kapsam dışı; plana alınmadı.
- **Tür tutarlılığı:** `calcLanded`, `parseDraft`, `applyParseToDraft`, `buildLandedXlsx`, `buildLandedPdf` imzaları ve `input`/`result` alan adları "Ortak veri şekilleri" ile görevler arasında aynı.
- **Oran:** Plan uzunluğu spec'in birkaç katı; gövdeler yerine imza, test adı ve değer verildi.
