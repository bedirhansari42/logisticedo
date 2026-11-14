# Free of Charge (FOC) Fatura Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sevkiyatın içinde "Free of Charge Invoice" belgesi: ücretsiz sevkiyat işareti, FOC PDF/Excel çıktısı, kalemlerde "gümrük değeri" etiketleri, yeni sevkiyat kutusu ve listede rozet.

**Architecture:** Durum `state.foc`; `foc.enabled` ise belge listesinde `ci` yerine `foc` görünür. PDF/Excel `renderInvoice`/`invoiceSheet`'in mevcut `kind` parametresine `"foc"` dalı eklenir. Fatura referansı veren diğer belgeler etiketi tek yardımcıdan alır. Form alanları ayrı küçük bileşende (şema üretimine dokunulmaz).

**Tech Stack:** React 18 + Vite + Electron, pdf-lib, ExcelJS, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-14-free-of-charge-invoice-design.md`

## Global Constraints

- `foc.enabled` olmayan sevkiyatlarda tüm çıktılar (CI, PL ve diğerleri) **birebir aynı** kalır.
- FOC belgesinde KDV, navlun/sigorta/indirim satırı ve banka bilgisi yok; sabit beyan: `"No commercial value. The goods are free of charge and their value is declared for customs purposes only."`
- Belgeler İngilizce; arayüz TR + EN; `node scripts/check-i18n.mjs` (desktop/ içinde) hatasız geçmeli, `t("...")` anahtarları tırnaklı yazılır, tırnaklı çift dizileri (`["a.b", "c.d"]`) çeviri denetimini yanıltır: alan listeleri `x.split(" ")` ile verilir.
- Form şeması (`form-schema.json`) değiştirilmez, `npm run schema` çalıştırılmaz.
- Veri cihazdan çıkmaz; motor değişiklikleri web sitesini bozmamalı; `documents.html` dokunulmaz.
- **Git komutu çalıştırma** (kullanıcı git'i elle yönetir); görev sonunda "Checkpoint" değişen dosyaları listeler.
- Node testleri yalnızca saf `.mjs` modüllerle (`@engine` alias'ı Node'da çözülmez); komutlar `desktop/` içinden.
- Tarayıcı doğrulaması: `node <scratchpad>/cdp.mjs "file:///…/desktop/app/index.html" betik.js ekran.png profilDizini` (Chrome `--allow-file-access-from-files` ile, `npm run build` sonrası; betik yardımcıları `prelude.js`'te). Kullanıcının `~/Library/Application Support/logisticedo` klasörüne dokunma; test profili scratchpad'de.

## Review Focus

1. Eski kayıtlarda (`foc` yok) sevkiyat açılır; "ücretsiz değil" gibi davranır, çıktılar değişmez.
2. "Ücretsiz sevkiyat" kutusu kapatılınca kalemler ve alanlar kaybolmaz, belge listesi CI'a döner.
3. Ücretsiz sevkiyatta eski `#/s/<id>/ci` adresi açılırsa editör çökmez, Genel bilgilere düşer.
4. Hiç kalemde değer yokken FOC PDF/Excel çökmez, fiyat sütunu ve toplam yazılmaz, "no commercial value" yazılır.
5. Bir kalemde değer, diğerinde boş: toplam yalnızca dolu olanları toplar, PDF çökmez.
6. `OTHER` nedeni seçilip serbest metin boşsa belgede "OTHER" yazar (boş satır çıkmaz).
7. Proformadan sevkiyat oluşturma ve sevkiyat çoğaltma `foc` durumunu bozmaz (proformadan: ücretsiz değil; çoğaltmada: kaynaktaki gibi).

---

## File Structure

Create:
- `assets/js/app/foc.js` — saf (importsuz) `FOC_REASONS`, `focReasonText`; motor ve masaüstü ikisi de buradan kullanır.
- `desktop/src/foc/model.mjs`, `model.test.mjs` — `foc.js`'i yeniden dışa aktarır, `docGroupsFor` ekler.
- `desktop/src/components/form/FocSettings.jsx` — kutu, neden, not.

Modify: `assets/js/app/doc-model.js`, `pdf-builder.js`, `excel-builder.js`; `desktop/src/lib/{shipment-state.js,download.js,strings.js}`, `desktop/src/pages/{Editor.jsx,NewShipment.jsx}`, `desktop/src/components/{ShipmentTable.jsx,form/ItemsTable.jsx}`, `desktop/package.json`.

---

### Task 1: Durum ve saf yardımcılar

**Files:**
- Create: `assets/js/app/foc.js`, `desktop/src/foc/model.mjs`, `desktop/src/foc/model.test.mjs`
- Modify: `assets/js/app/doc-model.js` (`createEmptyState`), `desktop/src/lib/shipment-state.js` (`summarize`), `desktop/package.json`

**Interfaces:**
- Produces (`assets/js/app/foc.js`, `model.mjs` yeniden dışa aktarır): `FOC_REASONS: string[]` = `["SAMPLE","REPLACEMENT","WARRANTY","GIFT","RETURN","OTHER"]`.
- Produces: `focReasonText(foc: { reason: string, reasonOther: string }): string` — büyük harf; `OTHER` ise `reasonOther` kırpılmış ve büyük harf, boşsa `"OTHER"`; bilinmeyen/boş `reason` → `"SAMPLE"`.
- Produces: `docGroupsFor(groups: {key,titleKey,docs:string[]}[], enabled: boolean): same shape` — `enabled` ise `ci` çıkarılır (`foc` kalır), değilse `foc` çıkarılır; grup sırası/diğer belgeler korunur, giriş değişmez.
- Produces (motor): `createEmptyState().foc = { enabled: false, reason: "SAMPLE", reasonOther: "", note: "" }`.
- Produces: `summarize(state).foc: boolean` (= `!!state.foc.enabled`).

- [ ] **Step 1: Write failing tests** (`model.test.mjs`): `focReasonText({reason:"GIFT",reasonOther:""})==="GIFT"`; `({reason:"OTHER",reasonOther:"  trade fair "})==="TRADE FAIR"`; `({reason:"OTHER",reasonOther:""})==="OTHER"`; `({reason:"",reasonOther:""})==="SAMPLE"`; `docGroupsFor` örnek gruplarla (`commercial:["ci","foc","pl"]`): `enabled=true` → commercial `["foc","pl"]`, `false` → `["ci","pl"]`; giriş nesnesi değişmedi (`deepEqual` öncesi/sonrası); `FOC_REASONS.length===6`.
- [ ] **Step 2:** `package.json`'a `"test:foc": "node --test src/foc/*.test.mjs"`. Run `cd desktop && npm run test:foc` — Expected: FAIL (modül yok).
- [ ] **Step 3:** `foc.js`'i (importsuz) ve `model.mjs`'i yaz. Motorda `createEmptyState`'e `foc` ekle (`items: [],` satırından önce). `summarize`'a `foc: !!state.foc?.enabled` ekle.
- [ ] **Step 4:** Run `npm run test:foc` — Expected: PASS. `node --input-type=module --check < ../assets/js/app/doc-model.js` — hata yok.
- [ ] **Step 5: Checkpoint.**

---

### Task 2: PDF ve Excel çıktısı

**Files:**
- Modify: `assets/js/app/pdf-builder.js`, `assets/js/app/excel-builder.js`, `desktop/src/lib/download.js`

**Interfaces:**
- Consumes: `state.foc` (Task 1); `focReasonText` `assets/js/app/foc.js`'ten (Task 1, testli).
- Produces: `buildPdf(state, lh, "foc")`; `"all"` ve `"both"` yolunda `state.foc.enabled` ise CI yerine FOC. `TITLES.foc = "Free of Charge Invoice"`; `setTitle` FOC için fatura no.
- Produces: `invRefLabel(s): string` (`pdf-builder.js` ve `excel-builder.js` içinde yerel işlev) → `s.foc?.enabled ? "Free of Charge Invoice" : "Commercial Invoice"`; fatura numarası referansı veren **tüm** yerlerde (`["Commercial Invoice", …]` çiftleri ve CMR'daki `docs` listesi) bu etiket kullanılır; Excel `docPairs("pl")` başı `["COMMERCIAL INVOICE", …]` ücretsizde `["FREE OF CHARGE INVOICE", …]`.
- Produces: `renderInvoice(ctx, s, "foc")` / `invoiceSheet(wb, s, "foc")` / `buildXlsx` ücretsiz sevkiyatta FOC sayfası + packing list; `buildDownload("foc", s, lh)` → `Free-of-Charge-Invoice_<no>.pdf`; `buildDownload("xlsx", …)` ücretsizde `FOC-PL_<no>.xlsx` adı.
- FOC dalı farkları: başlık `FREE OF CHARGE INVOICE`; numara çifti `Invoice No.`/`Invoice Date`; `Reason for shipment` çifti = `focReasonText`; `Proforma Invoice` çifti normal; para birimi/`Terms of Delivery` çiftleri yalnızca gümrük değeri varsa; kalem tablosu fiyat/tutar sütunları (`Customs Unit Value`, `Customs Value`) yalnızca `T.lines.some(v => v > 0)` iken, KDV sütunu hiç; toplam kutusu yalnızca değer varsa tek satır `TOTAL CUSTOMS VALUE`; navlun/sigorta/diğer/indirim/KDV satırı ve ağırlık özeti kuralları: ağırlık özeti CI'daki gibi (`showWeightsOnInvoice`); `Amount in words` yalnızca değer varsa; banka bloğu yok; imza kutusu beyan metni = sabit beyan + (`foc.note` doluysa ek satır); `Notes` kutusu yok (not beyanın altında). Excel: aynı koşullarla formüller yalnızca değer varsa (`ROUND(E*G,2)` ve `SUM`), toplam satırı `TOTAL CUSTOMS VALUE`, banka/KDV/navlun yok.

- [ ] **Step 1:** Mevcut ticari fatura ve packing list çıktısını referans al (tarayıcıda, ücretsiz olmayan bir sevkiyatla PDF sayfa sayısı ve Excel hücre metinleri; Step 4'te karşılaştırılacak).
- [ ] **Step 2:** `pdf-builder.js`'te `renderInvoice` FOC dalı, `TITLES`, `buildPdf` dalları, `invRefLabel` ve tüm referans çiftleri; `excel-builder.js`'te `invoiceSheet`/`docPairs`/`buildXlsx`/`invRefLabel`; `download.js` türleri ve adları.
- [ ] **Step 3:** Run `node --input-type=module --check < ../assets/js/app/pdf-builder.js` ve `excel-builder.js` — hata yok. `npm run build` — hatasız.
- [ ] **Step 4:** Tarayıcıda doğrula (sevkiyat durumunu IndexedDB'ye `foc.enabled:true` ile yazıp PDF/Excel indirerek, `qlmanage -t -s 1400` ile PDF'i görüntüleyerek): (a) değerli kalemler → "FREE OF CHARGE INVOICE", "Reason for shipment: SAMPLE", Customs Value sütunları, `TOTAL CUSTOMS VALUE`, sabit beyan, banka/KDV yok; (b) hiç değer yok → fiyat sütunları ve toplam yok, "no commercial value" beyanı, çökme yok; (c) bir kalem değerli diğeri boş → çökme yok; (d) `OTHER` + boş metin → "OTHER"; (e) Excel'de FOC + Packing List sayfaları, formüller yalnızca değerli durumda; packing list ve diğer belgelerde referans "Free of Charge Invoice"; (f) ücretsiz olmayan sevkiyatta CI/PL PDF ve Excel Step 1'deki referansla aynı.
- [ ] **Step 5: Checkpoint.**

---

### Task 3: Belge listesi, form ve editör

**Files:**
- Create: `desktop/src/components/form/FocSettings.jsx`
- Modify: `desktop/src/lib/shipment-state.js` (`DOC_GROUPS`, `ALL_DOCS`, `DOC_SECTIONS`, `DOC_ONLY`, `docStatus`), `desktop/src/pages/Editor.jsx`, `desktop/src/components/form/ItemsTable.jsx`, `desktop/src/lib/strings.js`

**Interfaces:**
- Consumes: `docGroupsFor`, `FOC_REASONS` (Task 1); `buildDownload("foc")`, `buildPdf(...,"foc")` (Task 2).
- Produces: `DOC_GROUPS` commercial grubu `["ci","foc","pl","pallet","contract","bill"]`; `DOC_SECTIONS.foc = ["A","B","C","D","F","H"]`; `DOC_ONLY.foc` = `{ A: meta.invoiceNo meta.invoiceDate meta.orderRef meta.currency, C: shipment.incoterm shipment.incotermPlace, F: f.totalsTitle packing.totalPackages packing.totalNet packing.totalGross packing.totalVolume options.showWeightsOnInvoice, H: sign.name sign.title sign.place }` (alan listeleri `x.split(" ")`); `docStatus(state,"foc")` `ci` ile aynı kurala; `USES.foc = []` (Editor).
- Produces: `FocSettings({ ctx })` — "Ücretsiz sevkiyat (Free of Charge)" kutusu (`foc.enabled`), kutu açıksa neden seçici (`FOC_REASONS`, etiketler çeviri anahtarı `d.foc.reason.<ANAHTAR>`), `OTHER` iken serbest metin (`foc.reasonOther`), not alanı (`foc.note`); `setField(ctx, bind, v)` kullanır.
- Editor: belge grupları `docGroupsFor(DOC_GROUPS, state.foc.enabled)`; `isDoc` yalnızca görünen belgeler için; görünmeyen belge adresi (`ci`↔`foc`) `general`'a düşer; `previewDoc = isDoc ? step : (state.foc.enabled ? "foc" : "ci")`; `FocSettings` Genel bilgiler adımının en üstünde ve `foc` belge sayfasında gösterilir; `ctx.focMode = state.foc.enabled`.
- ItemsTable: `ctx.focMode` iken fiyat ve tutar sütun başlıkları çeviri anahtarları `d.foc.colPrice`/`d.foc.colAmount` ("Gümrük birim değeri"/"Gümrük değeri"; EN "Customs unit value"/"Customs value"), KDV % sütunu gizli.
- Çeviri (TR+EN, `d.foc.*`): kutu etiketi, ipucu ("Ücretsiz sevkiyatta ticari fatura yerine Free of Charge fatura hazırlanır; kalem fiyatları gümrük değeri olarak kullanılır, boş bırakılabilir."), neden başlığı ve altı neden etiketi, "Diğer neden", not, sütun başlıkları, `pv.foc` ("Free of Charge invoice").

- [ ] **Step 1:** Listeler, `docStatus`, `FocSettings`, Editor ve ItemsTable değişikliklerini, çevirileri yaz.
- [ ] **Step 2:** `node scripts/check-i18n.mjs`, `npm run build`, `npm run test:foc`.
- [ ] **Step 3:** Tarayıcıda doğrula: yeni sevkiyat → Genel bilgilerde kutu görünür; işaretle → sol listede "Free of charge invoice" var, "Commercial invoice" yok, önizleme FOC; kalem tablosunda sütunlar "Customs unit value"/"Customs value", KDV sütunu yok; neden `OTHER` → metin alanı çıkar; kutuyu kapat → liste CI'a döner, kalemler duruyor; ücretsizken `#/s/<id>/ci` açılınca çökmeden Genel bilgiler görünür; FOC PDF ve Excel (önizleme çubuğundan) iner; normal sevkiyatta davranış değişmedi (liste, önizleme, sütunlar).
- [ ] **Step 4: Checkpoint.**

---

### Task 4: Yeni sevkiyat kutusu, liste rozeti, proforma/çoğaltma

**Files:**
- Modify: `desktop/src/pages/NewShipment.jsx`, `desktop/src/components/ShipmentTable.jsx`, `desktop/src/lib/shipment-state.js` (yalnızca gerekirse), `desktop/src/lib/strings.js`

**Interfaces:**
- Consumes: `state.foc` (Task 1), `summary.foc`.
- `NewShipment`: ilk karta "Ücretsiz sevkiyat (Free of Charge)" kutusu (yerel durum, varsayılan kapalı); yükleme, "boş sevkiyat" ve "proformalarımdan seç" yolları oluşan kayıtta `state.foc.enabled`'ı bu değerle yazar (`create(state, …)` ve `pickProforma` kaydetmeden önce). Proformadan geçişte kutu kapalıysa durum değişmez (varsayılan ücretsiz değil).
- `ShipmentTable`: başlık hücresine `s.foc` iken `<span className="sub">` yanında küçük "Ücretsiz" rozeti (`t("d.foc.badge")`, yeni `status`-benzeri stil yerine mevcut `sub` sınıfı + `foc-badge` sınıfı; stil `desktop/src/styles` içinde mevcut rozet diline uyar).
- `duplicateRecord` `foc`'u kaynaktaki gibi korur (değişiklik gerekmiyorsa dokunma).

- [ ] **Step 1:** Kutuyu, üç yolda bayrak yazmayı, rozeti ve çevirileri ekle.
- [ ] **Step 2:** `node scripts/check-i18n.mjs`, `npm run build`.
- [ ] **Step 3:** Tarayıcıda doğrula: kutuyu işaretleyip "boş sevkiyat" → açılan sevkiyat ücretsiz (listede FOC); kutu kapalı → normal; bir proforma seçip kutu işaretli → sevkiyat ücretsiz, kutu kapalı → normal; Sevkiyatlar listesinde ve panelde ücretsiz sevkiyatın yanında "Ücretsiz" rozeti, normalde yok; ücretsiz sevkiyatı çoğalt → kopya da ücretsiz.
- [ ] **Step 4: Checkpoint.**

---

### Task 5: Bütünleşik doğrulama

**Files:** değişiklik yok (bulgu çıkarsa ilgili görevin dosyaları).

- [ ] **Step 1:** `cd desktop && npm run test:foc && npm run test:proforma && npm run test:backup && npm run test:planner && npm run test:landed && npm run test:notes && node scripts/check-i18n.mjs && npm run build` — Expected: hepsi hatasız/PASS.
- [ ] **Step 2:** Review Focus maddelerini tek tek işaretle (Task 2–4'te yazılan doğrulamaların sonuçlarına göre); eski kayıt senaryosu için IndexedDB'ye `foc` alanı olmayan bir sevkiyat yazıp açarak "ücretsiz değil" davrandığını ve CI PDF'inin değişmediğini göster. Yedek: ücretsiz sevkiyat içeren yedek al/yükle (alan korunur).
- [ ] **Step 3:** Kullanıcıya bildir: yapılanlar, test sonuçları, değişen dosyalar; commit kullanıcıda; ücretsiz sevkiyatta satış sözleşmesi ve poliçe/bono'nun görünür kaldığını hatırlat.
