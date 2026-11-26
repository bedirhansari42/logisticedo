# Palet Bazlı Packing List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paletleri kalemlere bağlı içerik satırlarıyla (karton, miktar, C/No.) yeniden kurmak; düzenleme ekranı, PDF, etiketler, geçiş ve yedekler dahil.

**Architecture:** Saf hesaplar yeni motor modülünde (`assets/js/app/pallets.js`, DOM yok); PDF/etiket (motor) ve masaüstü arayüzü bu modülü kullanır. Palet yapısı `state.pallets` içinde kaldığı için yedek biçimi değişmez; eski kayıt/yedekler açılışta `migrate()` → `normalizePallets()` ile dönüştürülür.

**Tech Stack:** Vanilla ES modülleri (motor), React 19 + Vite (masaüstü), pdf-lib, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-26-pallet-packing-list-design.md`

## Global Constraints

- Statik site (`documents.html`, `assets/js/app/main.js`) değiştirilmez; motor eski biçimli paleti (yalnız `contents`) basmaya devam etmeli.
- Sayı girdileri metin olarak saklanır, `num(v, dec)` ile okunur (TR virgül, EN nokta).
- Arayüz metinleri TR+EN `desktop/src/lib/strings.js`; `node scripts/check-i18n.mjs` 0 eksik vermeli. Belgeler İngilizce.
- "-" HS kodu boş basılır: PDF'e giden durum `forPrint()`'ten geçer (zaten `buildDownload`/`Preview`'da var).
- Commit atılmaz: kullanıcı git'i elle yönetir. Her görev sonunda değişen dosyalar listelenir.
- Node testleri motoru şu stub'larla yükler: `globalThis.localStorage = { getItem: () => null, setItem() {} }; globalThis.document = { querySelectorAll: () => [], documentElement: { dataset: {} }, title: "" };` ve ardından dinamik `import("../../../assets/js/app/pallets.js")`.

## Review Focus

1. Kalem silindikten sonra paletteki satırı (sahipsiz): arayüzde uyarı + silinebilir, PDF basmaz, durum "partial" — Task 1 `orphan lines` testi.
2. Atamadan sonra kalemin kap sayısı/miktarı değişirse: "over"/"under" görünür, sessizce düzeltilmez — Task 1 `allocation reacts to item changes` testi.
3. TR ondalık virgül ("1,5") karton/miktar/ağırlık girdileri doğru okunur — Task 1 `decimal comma` testi.
4. Kap sayısı olmayan kalem (yalnız miktar): karton/C/No. boş, dağıtım miktarla denetlenir — Task 1 `item without packages` testi.
5. Sayı olmayan girdi ("abc") boş sayılır; hiçbir yerde NaN basılmaz — Task 1 `non-numeric input` testi.

---

### Task 1: Palet hesap modülü (motor)

**Files:**
- Create: `assets/js/app/pallets.js`
- Modify: `assets/js/app/doc-model.js` (`newPallet` → `lines: []` ekle; `newPalletLine` ekle)
- Create: `desktop/src/pallets/pallets.test.mjs`
- Modify: `desktop/package.json` (`"test:pallets": "node --test src/pallets/*.test.mjs"`)

**Interfaces:**
- Produces (hepsi `pallets.js`'ten; `s` = belge durumu; sayılar `number|null`):
  - `newPalletLine(p = {}) => { id, itemId: "", cartons: "", qty: "" , ...p }` (doc-model.js'te, `uid()` ile)
  - `normalizePallets(raw) => Pallet[]` — dizi değilse `[]`; nesne olmayan palet düşer; `id` yoksa yeni `uid()`; `no,type,dimensions,net,gross,contents` metne (`null/undefined` → `""`, sayı → `String`); `lines`: nesne + metin `itemId` olanlar kalır, `id` yoksa üretilir, `cartons/qty` metne.
  - `lineQty(s, line) => { value: number|null, suggested: boolean }` — `qty` doluysa o; değilse kalem `qty` ve `packages` ve satır `cartons` varsa `item.qty * cartons / packages` (sonuç tam sayıya ±1e-9 yakınsa tam, değilse 3 ondalık), `suggested: true`.
  - `palletWeight(s, pallet, kind /* "net"|"gross" */) => { value, suggested }` — alan doluysa o; değilse satırların `share × item.netWeight|grossWeight` toplamı (2 ondalık); hiç pay yoksa `null`. `share = cartons/packages` (ikisi de varsa), yoksa `lineQty.value / item.qty`.
  - `cartonNumbers(s) => Map<lineId, string>` — paletler/satırlar sırasıyla, kartonu > 0 (tam sayıya yuvarlanmış) satırlara `"a-b"` ya da `"a"`; sahipsiz satır atlanır.
  - `allocation(s) => Array<{ itemId, cartons: {total, assigned}, qty: {total, assigned}, status: "ok"|"under"|"over" }>` — yalnız dolu kalemler (açıklama ya da miktar); `assigned.qty` = satırların `lineQty.value` toplamı; durum: karton toplamı biliniyorsa kartona, yoksa miktara göre; ikisi de yoksa atanmış satır varsa "ok", yoksa "under".
  - `orphanLines(s) => string[]` — kalemi olmayan satır kimlikleri.
  - `palletStatus(s) => "empty"|"partial"|"ready"` — palet yoksa empty; `allocation` içinde ok olmayan ya da sahipsiz satır varsa partial; aksi ready.
  - `packageWord(s) => string` — dolu kalemlerin `packageType || s.packing.packageType` değerleri büyük harf, sonu S'li çoğul; tek değerse o (ör. "CARTONS"), değilse ya da boşsa "PACKAGES".
  - Değiştiriciler (`update((d) => …)` içinde çağrılır, `d`'yi değiştirir): `allOnOnePallet(s)` (paletleri tek paletle değiştirir; her dolu kalem için kalan karton/miktarla satır), `fillRemaining(s, palletId) => number` (eklenen/artırılan satır sayısı; aynı kalemin satırı varsa kartonunu/miktarını artırır), `addItemLine(s, palletId, itemId)` (kalanı kadar kartonla; kalan yoksa boş satır).

- [ ] **Step 1: Write the failing tests** (`pallets.test.mjs`; yardımcı: `item({id, qty, packages, netWeight, grossWeight, description:"x", packageType})`, `st(items, pallets)`; `num` için dec ".")
  - `newPallet has empty lines`: `assert.deepEqual(newPallet().lines, [])`.
  - `normalizePallets keeps legacy contents and drops junk lines`: girdi `[{ no: 1, contents: "Pumps 10 PCS" }, "x", { lines: [{ itemId: "a", cartons: 5 }, { cartons: "2" }, null] }]` → 2 palet; `[0].no === "1"`, `[0].contents === "Pumps 10 PCS"`, `[0].lines` `[]`; `[1].lines.length === 1`, `[1].lines[0].cartons === "5"`, her palet ve satırda metin `id`.
  - `normalizePallets of non-array is empty`: `null`, `"x"`, `{}` → `[]`.
  - `carton numbers run across pallets`: kalemler a(packages 5), b(packages 5), c(packages 3); palet1 satırlar a:5, b:3; palet2 b:2, c:3 → sırasıyla `"1-5"`, `"6-8"`, `"9-10"`, `"11-13"`; tek kartonlu satır `"14"` biçiminde tek sayı (ayrı vaka).
  - `suggested qty from cartons`: item qty 50, packages 5; satır cartons 2, qty "" → `{ value: 20, suggested: true }`; qty "7" → `{ value: 7, suggested: false }`; item qty 10, packages 3, cartons 1 → `3.333`.
  - `suggested pallet weights from item shares; entered weight wins`: item net 100 gross 110 packages 5; palet satırı cartons 2 → net `{40, true}`, gross `{44, true}`; palet `gross: "335"` → `{335, false}`; satırsız palet → `{ value: null }`.
  - `allocation ok / under / over`: a packages 5; atanan 5 → ok; 3 → under (`cartons.assigned === 3`); 6 → over.
  - `allocation reacts to item changes` (Review Focus 2): a packages 10, atanan 8 → under; kalemi packages 5 yap → over.
  - `item without packages` (Review Focus 4): a qty 10, packages "" ; satır qty "10" → ok; `cartonNumbers` bu satır için yok; satır qty "4" → under.
  - `orphan lines` (Review Focus 1): satır itemId "gone" → `orphanLines` `["<id>"]`; `palletStatus` "partial"; `cartonNumbers` onu atlar.
  - `decimal comma` (Review Focus 3), ayrı dosya `pallets.tr.test.mjs` (dil modül yüklenirken bir kez okunduğu için): stub `getItem: (k) => (k === "lgx.lang" ? "tr" : null)`; palet net "1,5" → `palletWeight` `{ value: 1.5, suggested: false }`; satır cartons "2", qty "" ve kalem qty "10,5", packages "3" → `lineQty` `{ value: 7, suggested: true }`.
  - `non-numeric input` (Review Focus 5): cartons "abc", qty "x", net "?" → `lineQty.value === null`, `palletWeight(...).value` yalnız önerilenden ya da `null`, `cartonNumbers` satırı atlar; `JSON.stringify` çıktılarında `NaN` yok.
  - `packageWord`: hepsi "CARTONS"/"carton" → "CARTONS"; CARTONS+BOXES → "PACKAGES"; hiç tip yok ve `packing.packageType` "" → "PACKAGES"; tek tip "CARTON" (S'siz) → "CARTONS".
  - `allOnOnePallet`: iki paletli durum → 1 palet; satırlar her dolu kalem için `cartons === String(item.packages)` (yoksa `qty === String(item.qty)`); boş kalem satırı yok.
  - `fillRemaining`: a packages 5, palet1'de a:3; palet2'ye `fillRemaining` → 1 döner, palet2'de a:2; tekrar çağrı → 0; aynı palette a satırı varken çağrılırsa yeni satır açmaz, kartonu artırır.
  - `addItemLine`: kalanı 2 olan kalem → cartons "2"; kalanı 0 → cartons "".
  - `palletStatus`: palet yok → empty; tam dağıtım → ready; eksik → partial.

- [ ] **Step 2: Run tests to verify they fail**
  Run: `cd desktop && npm run test:pallets`
  Expected: FAIL (modül/işlevler yok).

- [ ] **Step 3: Implement** `pallets.js` (yalnız `doc-model.js`'ten `num`, `round`, `uid`, `newPalletLine`, `uiDec` içe aktarılır) ve `doc-model.js` değişikliklerini. `palletsFromItems` statik site için olduğu gibi kalır.

- [ ] **Step 4: Run tests to verify they pass**
  Run: `cd desktop && npm run test:pallets && node --input-type=module --check < ../assets/js/app/pallets.js`
  Expected: tümü PASS.

- [ ] **Step 5:** Değişen dosyaları listele (commit yok).

---

### Task 2: Geçiş, yedekler, belge durumu ve HS zorunluluğu

**Files:**
- Modify: `desktop/src/lib/shipment-state.js` (`migrate`: `base.pallets = normalizePallets(base.pallets)`; `docStatus("pallet")` → `palletStatus(state)` ve ardından `checkDoc(state, "pallet").length ? "partial"`)
- Modify: `desktop/src/requirements/model.mjs` (`DOC_RULES.pallet = ["hsCode"]`)
- Modify: `desktop/src/requirements/model.test.mjs`, `desktop/src/backup/backup.test.mjs`

**Interfaces:**
- Consumes: Task 1 `normalizePallets`, `palletStatus`.
- Produces: `docsForRule("hsCode")` artık `["pl","xlsx","pallet"]` (sıra önemsiz).

- [ ] **Step 1: Write the failing tests**
  - `model.test.mjs`: mevcut `packing list and the two-sheet Excel require HS codes…` testini `docsForRule("hsCode").sort()` → `["pallet","pl","xlsx"]` ve `DOC_RULES.pallet` → `["hsCode"]` olacak biçimde güncelle; `checkDoc(s, "pallet")` HS'siz kalemde `[{ rule: "hsCode", ids: [...] }]`.
  - `backup.test.mjs` (motoru stub'la yükleyerek `normalizePallets`): `pallet lines survive backup → restore → normalize`: sevkiyat `state.pallets = [{ id:"p1", no:"1", lines:[{ id:"l1", itemId:"a", cartons:"5", qty:"" }] }]` → `createBackup` → JSON gidiş-dönüş → `planRestore` → `normalizePallets(plan.shipments[0].state.pallets)` satırı aynen korur.
  - `old-format pallets from a backup open without loss`: `state.pallets = [{ no:"1", contents:"Pumps" }]` → aynı döngü → `contents === "Pumps"`, `lines` `[]`.
  - `corrupt pallet lines from a backup are dropped, not fatal`: `lines: "x"` ve `lines: [5, { itemId: {} }]` → `lines` `[]`.

- [ ] **Step 2:** `cd desktop && npm run test:req && npm run test:backup` → FAIL.
- [ ] **Step 3:** Değişiklikleri uygula (`migrate` içinde `normalizePallets` çağrısı; `docStatus`; `DOC_RULES`).
- [ ] **Step 4:** `npm run test:req && npm run test:backup && npm run build` → PASS, derleme hatasız.
- [ ] **Step 5:** Değişen dosyaları listele.

---

### Task 3: PDF ve etiketler (motor)

**Files:**
- Modify: `assets/js/app/pdf-builder.js` (`renderPalletList`, `labelList`)

**Interfaces:**
- Consumes: Task 1 `cartonNumbers`, `lineQty`, `palletWeight`, `orphanLines`, `packageWord`.

- [ ] **Step 1: Implement `renderPalletList(ctx, s)`** — üst kısım (başlık, taraflar, bilgi ızgarası) aynı kalır. Tablo sütunları: `no` ("Pallet / Pkg No.") · `desc` ("Description", flex) · `hs` ("HS Code"; yalnız `s.options.showHsOnPl` ve en az bir bağlı kalemde HS) · `qty` ("Qty") · `ctn` (`packageWord` başlık biçiminde, ör. "Cartons"; yalnız en az bir satırda karton) · `cno` ("C/No."; yalnız karton varsa) · `dims` ("Dimensions (cm)"; yalnız ölçü varsa) · `net` · `gross` · `vol` (yalnız ölçüden hacim varsa). Satırlar, her palet için:
  - başlık satırı `{ bold: true, fill: true, cells: { no: \`${type} ${no}\`, dims, net, gross, vol } }` (ağırlıklar `palletWeight`, öneri de basılır),
  - not doluysa `{ cells: { desc: contents } }`,
  - her bağlı satır (sahipsizler hariç) `{ cells: { desc: item.description (satır sonları boşluk), hs: item.hsCode, qty: fmtQty(lineQty.value) + " " + UNIT, ctn, cno } }`.
  Son satır `{ bold, fill, cells: { desc: \`TOTAL: ${n} PALLET(S) STC ${toplamKarton} ${packageWord}\` (karton yoksa "STC …" kısmı yok), net, gross, vol } }`. Özet bloğu: "Total Pallets", toplam karton varsa `packageWord` başlıklı satır, Net, Gross, Volume. Palet yoksa mevcut "—" davranışı.
- [ ] **Step 2: Implement `labelList` "pallets" kaynağı** — `desc` = bağlı satırların kalem açıklamaları (benzersiz, "; " ile), yoksa `contents`; `gross` = `palletWeight(s, p, "gross").value`.
- [ ] **Step 3: Verify** — `node --input-type=module --check < assets/js/app/pdf-builder.js`; `cd desktop && npm run build`. Görsel/metin doğrulaması Task 5'te.
- [ ] **Step 4:** Değişen dosyaları listele.

---

### Task 4: Palet düzenleme ekranı

**Files:**
- Rewrite: `desktop/src/components/form/PalletsTable.jsx`
- Modify: `desktop/src/lib/strings.js` (TR+EN, `d.pal.*`), `desktop/src/styles/dash.css`

**Interfaces:**
- Consumes: Task 1 tüm işlevler; `ctx.update((d) => …)`, `ctx.state`, `NUM_FILTER`, `ListInput` (`dl-pkg`).

- [ ] **Step 1: Implement** (spec'teki çizim): üst çubuk "Hepsini tek palete koy" (palet varsa `askConfirm` ile onay) + "Palet ekle"; dağıtım özeti (`allocation`): hepsi ok ise yeşil "Tüm kalemler paletlerde", değilse kalem kalem `"{desc}: {assigned}/{total} {birim}"` eksik/fazla; sahipsiz satır varsa uyarı. Her palet kartı: başlık alanları no, cins (ListInput `dl-pkg`), ölçü, net, brüt (boşsa `palletWeight` önerisi yer tutucu), "Not" (contents, AutoArea), sil. Satır tablosu: ürün açıklaması (salt metin), HS (salt metin; boşsa "—"), kap (sayı girdisi), miktar (sayı girdisi; boşsa `lineQty` önerisi yer tutucu) + birim, C/No. (salt metin), satır sil. Sahipsiz satır: açıklama yerine `d.pal.orphan` uyarısı. Altında "Ürün ekle" (`<select>`: dolu kalemler, kalan kartonla etiketli) ve "Kalanları buraya ekle".
  Yeni metin anahtarları (TR / EN): `d.pal.allOne` "Hepsini tek palete koy" / "Put everything on one pallet"; `d.pal.confirmAllOne` "Mevcut paletler silinip tüm kalemler tek palete konacak. Devam edilsin mi?" / "Existing pallets will be replaced by one pallet holding all items. Continue?"; `d.pal.addItem` "Ürün ekle" / "Add item"; `d.pal.fillHere` "Kalanları buraya ekle" / "Add the rest here"; `d.pal.allAssigned` "Tüm kalemler paletlerde" / "All items are on pallets"; `d.pal.under` "{desc}: {assigned}/{total} {unit} palete konmadı" / "{desc}: {assigned}/{total} {unit} not on a pallet yet"; `d.pal.over` "{desc}: {assigned}/{total} {unit}, fazla dağıtılmış" / "{desc}: {assigned}/{total} {unit}, more than the item has"; `d.pal.orphan` "Bu satırın kalemi silinmiş; belgeye basılmaz" / "This line's item was deleted; it is not printed"; `d.pal.note` "Not" / "Note"; `d.pal.cartons` "Kap" / "Pkgs"; `d.pal.qty` "Miktar" / "Qty"; `d.pal.cno` "C/No." / "C/No."; `d.pal.hint` "Her palet için ölçü ve tartılan brüt ağırlığı girin, sonra paletteki ürünleri ekleyin. Boş ağırlık ve miktarlar kalemlerden önerilir." / "Enter each pallet's dimensions and weighed gross weight, then add the items on it. Empty weights and quantities are suggested from the items."; `d.pal.empty` "Henüz palet yok. 'Hepsini tek palete koy' ile başlayın." / "No pallets yet. Start with 'Put everything on one pallet'.".
- [ ] **Step 2: Verify** — `node scripts/check-i18n.mjs` (0 eksik), `npm run build` hatasız.
- [ ] **Step 3:** Değişen dosyaları listele.

---

### Task 5: Uçtan uca doğrulama ve not

**Files:**
- Scratchpad CDP betiği (oturum geçici klasörü; ürün koduna girmez)
- Modify: bellek notu (`project_logisticedo.md`)

- [ ] **Step 1: Electron + CDP** (yalıtılmış `--user-data-dir`, `lgx.tour={status:"done"}`, `lgx.autobackup={lastAt:now}`, test belgeleri scratchpad'den): proforma → sevkiyat → HS kodlarını doldur (biri "-") → Palet sayfası "Hepsini tek palete koy" → PDF metni: tek "PALLET 1", 4 kalem, "TOTAL: 1 PALLET(S) STC", "-" basılmamış; bir kalemi "Palet ekle" + "Kalanları buraya ekle" ile ikinci palete böl → C/No. aralıkları sürer; bir kalemin kap sayısını artır → "palete konmadı" uyarısı ve sol menüde sarı nokta; HS boş kalemde palet listesi indirmesi engellenir. Eski biçimli palet: IndexedDB'ye `pallets:[{no:"1",contents:"Legacy text"}]` yaz, sayfayı aç → Not alanında metin, PDF'te basılı. Etiket (kaynak: paletler) PDF metninde kalem açıklamaları.
- [ ] **Step 2:** Tüm test takımları (`planner landed foc proforma backup notes net update tour bankedit req pallets`) + `check-i18n` geçer.
- [ ] **Step 3:** Bellek notunu güncelle; değişen dosyaları ve önerilen commit mesajını kullanıcıya ver.
