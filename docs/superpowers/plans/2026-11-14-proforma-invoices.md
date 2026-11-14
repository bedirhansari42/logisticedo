# Proforma Faturalar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Masaüstü uygulamasına "Proforma Faturalar" sayfası eklemek: proforma hazırlama/yükleme/listeleme, antetli PDF + formüllü Excel çıktısı ve yeni sevkiyatı listeden seçilen proformadan başlatma.

**Architecture:** Ayrı `proformas` IndexedDB deposu; kayıt, sevkiyatla aynı `state` şeklini taşır (motorun `createEmptyState`/`migrate`'i). Sevkiyata geçerken proforma kopyalanır; sevkiyat kaydı `proformaId` taşır, "N sevkiyat" bilgisi bundan türetilir. PDF/Excel motoru `renderInvoice`/`invoiceSheet`'i `kind` parametresiyle yeniden kullanır; editör mevcut form bileşenlerini kullanır.

**Tech Stack:** React 18 + Vite + Electron, IndexedDB, pdf-lib, ExcelJS, `node --test` (saf `.mjs` modüller).

**Spec:** `docs/superpowers/specs/2026-11-14-proforma-invoices-design.md` (tek sapma: `shipmentIds` saklanmaz, `proformaId`'den türetilir; spec bu doğrultuda güncellendi).

## Global Constraints

- Veri cihazdan çıkmaz; sunucu, yapay zeka, dış ağ isteği yok.
- Belgeler (PDF/Excel) İngilizce; arayüz TR + EN. Çeviriler `desktop/src/lib/strings.js` `EXTRA.tr` ve `EXTRA.en`; `node scripts/check-i18n.mjs` (desktop/ içinde) hatasız geçmeli. `t("...")` anahtarları tırnaklı yazılmalı, dinamik anahtarlar denetimden kaçar.
- Proformada durum, onay, geçerlilik tarihi, "reddedildi" yok.
- IndexedDB `DB_VERSION` 2 → 3; mevcut depolara dokunulmaz.
- Motor (`assets/js/app/*`) web sitesiyle paylaşılır: değişiklikler CI/PL çıktısını **değiştirmemeli**; `documents.html` ve eski site dokunulmaz.
- Sevkiyat `Editor.jsx` davranışı değişmemeli (otomatik kayıt, banka otomatiği, şirket/antet seçimi).
- **Git komutu çalıştırma.** Kullanıcı git'i elle yönetir; her görev sonunda "Checkpoint" adımı değişen dosyaları listeler, commit atılmaz.
- Node testleri yalnızca saf `.mjs` modüllerle yazılır (`@engine` alias'ı Node'da çözülmez); `node --test` komutu `desktop/` içinden çalışır.
- Test sunucusu/arayüz denemelerinde 8765 portuna ve kullanıcının çalışan sunucusuna dokunma; Electron profili `~/Library/Application Support/logisticedo` kullanıcının gerçek verisidir: var olan klasörü **silme**, test için önce kullanıcıya sor.

## Review Focus

1. Numarası boş proformadan sevkiyat açılınca fatura no boş kalır (`CI-` gibi bozuk öneri çıkmaz).
2. `proformas` anahtarı olmayan eski yedek dosyası hatasız yüklenir; yüklenen proformanın orijinal dosya Blob'u yedekte gidip gelir.
3. Aynı proforma iki kez sevkiyata çevrilince iki bağımsız sevkiyat çıkar; birinin düzenlenmesi proformayı ve diğerini etkilemez.
4. Bir proforma silinince ona bağlı sevkiyat editörü açılır, çökmez, "silinmiş proforma" gösterir.
5. Okunamayan/boş dosya yüklenince hata gösterilir ve liste kaydı oluşmaz.
6. Kalemi/para birimi/alıcısı boş proforma önizlemede ve indirmede çökmez; önizleme eksik alanları söyler.
7. Arayüz dili TR ↔ EN değişince proforma editöründeki sayılar (ondalık ayırıcı) sevkiyat editöründeki gibi dönüşür.

---

## File Structure

Create:
- `desktop/src/proforma/model.mjs`, `model.test.mjs` — `nextProformaNo` (saf).
- `desktop/src/proforma/convert.mjs`, `convert.test.mjs` — `proformaToShipmentState` (saf).
- `desktop/src/lib/use-record.js` — `useShipment`'in genelleştirilmiş gövdesi (yükle, düzenle, otomatik kaydet).
- `desktop/src/lib/use-proforma.js` — `useRecord`'u proforma bağdaştırıcısıyla çağırır.
- `desktop/src/lib/record-pickers.js` — şirket / banka / antet seçim işleyicileri ve banka-otomatiği etkisi (Editor'dan çıkarılır, iki editör kullanır).
- `desktop/src/lib/proforma-records.js` — `newProformaRecord`, `summarizeProforma`, `migrateProforma`, `shipmentFromProforma`, `importProformaFile` (alias'lı yapıştırıcı kod).
- `desktop/src/pages/Proformas.jsx` — liste sayfası.
- `desktop/src/pages/ProformaEditor.jsx` — editör.
- `desktop/src/components/form/ProformaNotes.jsx` — notlar kartı.
- `desktop/src/components/ProformaPicker.jsx` — Yeni sevkiyat'taki seçici.

Modify: `assets/js/app/doc-model.js`, `pdf-builder.js`, `excel-builder.js`, `store.js`; `desktop/src/lib/{shipment-state.js,use-shipment.js,app-context.jsx,download.js,router.js,strings.js}`, `desktop/src/backup/{backup.mjs,backup.test.mjs,io.js}`, `desktop/src/components/{Preview.jsx,Sidebar.jsx,Icons.jsx}`, `desktop/src/pages/{Editor.jsx,NewShipment.jsx}`, `desktop/src/App.jsx`, `desktop/package.json`.

---

### Task 1: Saf mantık — numara önerisi ve sevkiyata dönüştürme

**Files:**
- Create: `desktop/src/proforma/model.mjs`, `desktop/src/proforma/model.test.mjs`, `desktop/src/proforma/convert.mjs`, `desktop/src/proforma/convert.test.mjs`
- Modify: `assets/js/app/doc-model.js` (`createEmptyState`, `missingProforma`), `desktop/src/lib/shipment-state.js` (`suggestInvoiceNo` export), `desktop/package.json` (script)

**Interfaces:**
- Produces: `nextProformaNo(nos: string[]): string` — `nos` en yeni kayıttan eskiye; ilk sondaki sayısı olan numarayı bir artırır (sıfır dolgusu korunur), yoksa `""`.
- Produces: `proformaToShipmentState(state: object, opts: { today: string, suggestInvoiceNo: (pi: string) => string, emptyProforma: object }): object` — derin kopya döner; `meta.invoiceNo` = proforma no doluysa `suggestInvoiceNo(no)`, boşsa `""`; `meta.plNo = ""`; `meta.invoiceDate = today`; `meta.proformaNo/proformaDate` korunur; `proforma = structuredClone(emptyProforma)`.
- Produces (motor): `createEmptyState().proforma = { notes: "" }`; `missingProforma(s): string[]` anahtarlar `miss.proformaNo`, `miss.seller`, `miss.buyer`, `miss.items`, `miss.currency` (sırayla, boş olanlar).
- Produces: `suggestInvoiceNo` artık `shipment-state.js`'ten dışa aktarılır.

- [ ] **Step 1: Write failing tests** — `model.test.mjs`: `nextProformaNo(["PI-2026-009"])==="PI-2026-010"`, `(["","PF7"])==="PF8"`, `(["ABC"])===""`, `([])===""`, `(["PI-99"])==="PI-100"`. `convert.test.mjs` (düz nesnelerle): proforma no `"PI-7"` + stub `suggestInvoiceNo = (p) => "CI-" + p.replace(/^PI-/, "")` → `meta.invoiceNo==="CI-7"`; proforma no `""` → `meta.invoiceNo===""` (stub çağrılmaz); `plNo===""`; `invoiceDate===today`; `proformaNo/Date` korunur; sonucu değiştirmek girdiyi değiştirmez (`items[0].description` mutasyonu); `proforma` boş kalıba sıfırlanır.
- [ ] **Step 2:** `package.json`'a `"test:proforma": "node --test src/proforma/*.test.mjs"` ekle. Run `cd desktop && npm run test:proforma` — Expected: FAIL (modül yok).
- [ ] **Step 3:** `model.mjs` ve `convert.mjs`'i yaz (motor import'u yok). Motorda `createEmptyState`'e `proforma: { notes: "" }` ekle, `missingProforma` ekle (`missingFields` kalıbında), `shipment-state.js`'te `suggestInvoiceNo`'ya `export` ekle.
- [ ] **Step 4:** Run `npm run test:proforma` — Expected: tümü PASS. Run `node --input-type=module --check < ../assets/js/app/doc-model.js` — hata yok.
- [ ] **Step 5: Checkpoint** — değişen dosyaları listele (commit yok).

---

### Task 2: Depo (v3), uygulama bağlamı ve yedek

**Files:**
- Modify: `assets/js/app/store.js`, `desktop/src/lib/app-context.jsx`, `desktop/src/backup/backup.mjs`, `desktop/src/backup/io.js`, `desktop/src/backup/backup.test.mjs`; sayaçların gösterildiği yer (`counts.shipments` / `summary.shipments` kullanan bileşen ve `d.bk.*` çevirileri, `grep` ile bul)

**Interfaces:**
- Produces (store): `listProformas(): Promise<rec[]>` (updatedAt azalan), `getProforma(id)`, `saveProforma(rec): Promise<boolean>`, `deleteProforma(id)`; `DB_VERSION = 3`, yeni depo `proformas` (`keyPath: "id"`); bellek yedeği (`memoryFallback.proformas`) shipments ile aynı kalıpta. `memoryFallback` üç yerde elle kuruluyor; tek yardımcıya (`fallback()`) indir.
- Produces (context): `useApp()` → `proformas`, `saveProforma(rec)`, `deleteProforma(id)`, `getProforma(id)`. `saveProforma`, `saveShipment` ile aynı kalıpta listeyi günceller.
- Produces (backup): `createBackup` çıktısı `data.proformas`; `validateBackup` `proformas`'ı isteğe bağlı sayar (yoksa `[]`, varsa dizi olmalı), özet `summary.proformas`; `planRestore` sonucu `proformas: rec[]` ve `counts.proformas`; `collectSnapshot`/`applyPlan` proformaları okur/yazar. Blob'lar mevcut `encode/decode` ile gider (kayıt içindeki `file.blob`).

- [ ] **Step 1: Write failing tests** (`backup.test.mjs`'e): proformalı snapshot `createBackup` → `validateBackup(b).summary.proformas === 2`; `proformas` anahtarı silinmiş eski yedek `ok:true` ve `summary.proformas===0`; `planRestore` boş yerel snapshot'ta `plan.proformas` hepsini ekler, daha yeni olanı günceller (mevcut shipments testlerinin kalıbı); `file: { blob: new Blob(["abc"], {type:"application/pdf"}) }` taşıyan kayıt `roundtrip` sonrası hâlâ `Blob` ve `size===3`. Mevcut testlerdeki `deepEqual(summary, {...})` beklentilerine `proformas: 0` ekle.
- [ ] **Step 2:** Run `npm run test:backup` — Expected: yeni testler FAIL.
- [ ] **Step 3:** `backup.mjs`, `io.js`, `store.js`, `app-context.jsx`'i uygula; `onupgradeneeded` `proformas` deposunu yoksa oluşturur. Yedek arayüzündeki sayaçlara proforma satırı ekle (TR+EN çeviri anahtarı).
- [ ] **Step 4:** Run `npm run test:backup` — Expected: tümü PASS. Run `npm run build` — Expected: hatasız.
- [ ] **Step 5: Checkpoint.**

---

### Task 3: PDF ve Excel çıktısı (`kind` parametresi)

**Files:**
- Modify: `assets/js/app/pdf-builder.js` (`renderInvoice`, `TITLES`, `buildPdf`), `assets/js/app/excel-builder.js` (`docPairs`, `invoiceSheet`, yeni `buildProformaXlsx`), `desktop/src/lib/download.js`

**Interfaces:**
- Produces: `buildPdf(state, lh, "proforma")` tek sayfa/çok sayfa PDF; `"all"` ve `"both"` **proforma içermez**. `TITLES.proforma = "Proforma Invoice"`; `setTitle` proforma için `meta.proformaNo` kullanır.
- Produces: `buildProformaXlsx(state): Promise<Blob>` — tek sayfa "Proforma Invoice", antetsiz, formüllü (CI sayfasıyla aynı formül kalıbı).
- Produces: `buildDownload("proforma", s, lh)` → `{ blob, name: "Proforma-Invoice_<no>.pdf" }`; `buildDownload("proforma-xlsx", s)` → `Proforma-Invoice_<no>.xlsx` (no boşsa `draft`).
- `renderInvoice(ctx, s, kind = "ci")` ve `invoiceSheet(wb, s, kind = "ci")`: `kind === "pi"` farkları — başlık "PROFORMA INVOICE"; numara çifti "Proforma No."/"Proforma Date" (`meta.proformaNo/proformaDate`); "Proforma Invoice" çifti çıkmaz; paket/ağırlık özeti çıkmaz; beyan yerine sabit not `"This is a proforma invoice and not a demand for payment."` (her zaman) ve `proforma.notes` doluysa "Notes" kutusu (tutar-yazıyla satırı kalıbında); imza tarihi `proformaDate`. `kind === "ci"` çıktısı birebir aynı kalır.

- [ ] **Step 1:** Mevcut CI PDF/Excel çıktısını referans al: tarayıcıda (CDP yöntemi, `reference_headless_chrome_ui_check`) bir test durumuyla `buildPdf(state,null,"ci")` ve `buildXlsx` çıktısının sayfa sayısı ve Excel hücre değerlerini not et (Step 4'te karşılaştırılacak).
- [ ] **Step 2:** `renderInvoice`/`invoiceSheet`'e `kind` ekle, `buildPdf` ve `buildProformaXlsx`'i bağla, `buildDownload` türlerini ekle. `docPairs(s, "pi")` başı `[["PROFORMA NO.", no], ["PROFORMA DATE", date]]`, "PROFORMA INVOICE" çifti atlanır; `shipmentPairs(s, "ci")` davranışı proforma için yeniden kullanılır.
- [ ] **Step 3:** Run `node --input-type=module --check < ../assets/js/app/pdf-builder.js` ve `... excel-builder.js` — hata yok.
- [ ] **Step 4:** Tarayıcıda doğrula: dolu bir durumla `buildPdf(...,"proforma")` PDF'i render edilip ekran görüntüsünde başlık "PROFORMA INVOICE", proforma no/tarih, kalem tablosu, toplamlar, banka, sabit not görünür; boş durumla (kalem/alıcı/para birimi yok) çökmeden üretilir; `"ci"` PDF'i ve CI Excel'i Step 1'deki referansla aynı; `buildProformaXlsx` hücreleri `H<r>` toplam formülü içerir (`ROUND(E*G,2)` satır formülü).
- [ ] **Step 5: Checkpoint.**

---

### Task 4: Kayıt kancasını genelleştir, seçim işleyicilerini ortaklaştır

**Files:**
- Create: `desktop/src/lib/use-record.js`, `desktop/src/lib/use-proforma.js`, `desktop/src/lib/record-pickers.js`
- Modify: `desktop/src/lib/use-shipment.js`, `desktop/src/pages/Editor.jsx`, `desktop/src/lib/shipment-state.js` (`newShipmentRecord`, `duplicateRecord`)

**Interfaces:**
- Produces: `useRecord(id: string, adapter: { get(id): Promise<rec|null>, save(rec): Promise<any>, toMeta(rec): object, summarize(state): object, migrate(state): object })` → aynı dönüş şekli: `{ status, meta, doc, update, updateMeta, saving, flush }`. Mevcut `useShipment(id)` birebir aynı dönüşü korur (adapter: `store.getShipment`, `saveShipment`, `migrate`, `summarize`).
- **Tuzak:** `toMeta` kaydı kaydederken `{...meta, updatedAt, lang, state, auto, summary}` yazıldığı için, meta'ya konmayan alanlar kayıttan **silinir**. Shipment adapter'ı `proformaId`'yi (yeni) taşımalı; proforma adapter'ı `source`, `file`, `lhId`, `companyId`, `bankId`, `bankAuto`, `createdAt`, `parse`'ı taşımalı.
- Produces: `useProforma(id)` = `useRecord(id, proformaAdapter)`; adapter'ın `migrate`'i `migrateProforma` (Task 5'te tanımlanır; bu görevde adapter `shipment-state.migrate` kullanır, Task 5'te değişir).
- Produces: `useRecordPickers({ sh, app, state, company, id, t })` → `{ onCompany(value), onBank(value), onLetterhead(value) }` ve banka para birimi otomatiği için içindeki `useEffect` (`Editor.jsx`'te `autoSeen` bloğu). `sh` `useRecord` dönüşü; `meta.companyId/bankId/bankAuto/lhId` alanlarını kullanır.
- `newShipmentRecord({ ..., proformaId = null })` kayda `proformaId` yazar; `duplicateRecord` kopyada `proformaId: null` yapar.

- [ ] **Step 1:** `use-shipment.js` gövdesini `use-record.js`'e taşı, adapter'dan çağıracak şekilde değiştir; `useShipment` ince sarmalayıcı olsun. Meta'ya `proformaId: rec.proformaId || null` ekle.
- [ ] **Step 2:** `Editor.jsx`'ten şirket/banka/antet işleyicilerini ve `autoSeen` etkisini `record-pickers.js`'e taşı; `Editor.jsx` kancayı kullansın. Davranış aynı (toast metinleri, `askConfirm` durum seçici dokunulmaz).
- [ ] **Step 3:** `newShipmentRecord`/`duplicateRecord`'u güncelle. Run `npm run build` — Expected: hatasız.
- [ ] **Step 4:** Regresyon (CDP, `LGX_TEST_DIR` ile): mevcut bir sevkiyatı aç, alıcı adını değiştir, 1 sn bekle, sayfayı yeniden aç — değişiklik kalıcı; para birimini değiştir — banka otomatiği çalışır; şirket seç — satıcı/banka dolar. Sevkiyat kaydında (`indexedDB` dökümü) `proformaId` alanı yazılıyor (`null`).
- [ ] **Step 5: Checkpoint.**

---

### Task 5: Proforma kayıtları, liste sayfası, yönlendirme ve menü

**Files:**
- Create: `desktop/src/lib/proforma-records.js`, `desktop/src/pages/Proformas.jsx`
- Modify: `desktop/src/lib/router.js`, `desktop/src/components/Sidebar.jsx`, `desktop/src/components/Icons.jsx`, `desktop/src/App.jsx`, `desktop/src/lib/use-proforma.js` (migrate), `desktop/src/lib/strings.js`

**Interfaces:**
- Produces (`proforma-records.js`):
  - `migrateProforma(saved: object): object` — `migrate(saved)` + `state.proforma = { notes: "", ...saved.proforma }`.
  - `summarizeProforma(state): { proformaNo, buyer, seller, currency, total, items, missing }` (`computeTotals`, `missingProforma`).
  - `newProformaRecord({ state, auto = new Set(), source, lhId = null, companyId = null, parse = null, file = null }): rec` — `{ id: uid(), source: "created"|"imported", lhId, companyId, bankId: null, bankAuto: true, createdAt, updatedAt, state, auto: [...], parse, file, summary }`.
  - `shipmentFromProforma(pf, { lhId?, companyId? }): shipmentRecord` — `proformaToShipmentState` + `newShipmentRecord({ state, lhId: lhId ?? pf.lhId, companyId: companyId ?? pf.companyId, proformaId: pf.id })`, `bankId/bankAuto` proformadan; `rec.lang = getLang()`.
- Router: `#/proformas` → `{ name: "proformas" }`; `#/pf/:id/:step?` → `{ name: "proformaEditor", id, step }` (`step` varsayılan `general`). Başlık yorumundaki rota listesini güncelle.
- Sidebar: "Proforma Faturalar" girişi Sevkiyatlar'ın **üstünde**; `proformaEditor` rotasında aktif; yanında kayıt sayısı. Yeni `proforma` simgesi (`Icons.jsx` kalıbında).
- `Proformas.jsx`: başlık + sayı; araç çubuğunda arama (`proformaNo`, `buyer`, `seller`), "Yeni proforma" ve "Dosya yükle" düğmeleri (yükleme Task 7'de bağlanır, bu görevde düğme var ama devre dışı); tablo sütunları: no (+kaynak simgesi/etiketi), alıcı, tutar (`useMoney`), güncelleme (`relTime`), bağlı sevkiyat sayısı (`app.shipments.filter(s => s.proformaId === pf.id).length`, 0 ise "—"); satır işlemleri: aç, çoğalt, sevkiyat oluştur, orijinal dosyayı aç (yalnızca `file` varsa: `URL.createObjectURL(file.blob)` ile yeni pencere/indirme `saveBlob`), sil (`window.confirm`). Çoğaltma numarayı `nextProformaNo` önerisiyle doldurur, tarihi bugüne alır, `file`'ı ve `source`'u `created`'a çevirir (kopya orijinal dosya taşımaz). "Yeni proforma": `freshState({ prev: proformas[0]?.state, profile })` + `lastCompanyId` şirketi `applyCompanyToState` ile (NewShipment.create kalıbı), `meta.proformaNo = nextProformaNo(...)`, `meta.proformaDate = todayIso()`, bir boş kalem; kaydet ve `go("/pf/<id>")`. "Sevkiyat oluştur" `shipmentFromProforma` + `saveShipment` + `go("/s/<id>")`. Boş durum metni.
- Çeviri anahtarları (TR+EN, `d.pf.*` öneki): menü adı, başlık, sayı, arama, boş durum, sütunlar, kaynak (hazırlandı/yüklendi), işlemler, silme onayı/bildirimi, `d.pf.untitled`.

- [ ] **Step 1:** `proforma-records.js`, router, sidebar, simge, `App.jsx` `Pages` dalları (`proformas` ve — Task 6 gelene kadar — `proformaEditor` için geçici boş durum yok: dal Task 6'da eklenir) ve `Proformas.jsx`'i yaz; `use-proforma.js` adapter'ını `migrateProforma`/`summarizeProforma`'ya çevir.
- [ ] **Step 2:** `node scripts/check-i18n.mjs` — Expected: eksik anahtar yok. `npm run build` — hatasız.
- [ ] **Step 3:** CDP: menüde girişi gör (Sevkiyatlar'ın üstünde); "Yeni proforma" kayıt oluşturur ve listede görünür (editör rotası henüz boş olabilir — kayıt IndexedDB'de `proformas` deposunda doğrulanır); arama filtreler; çoğalt numarayı artırır; sil kaydı kaldırır; boş liste metni görünür.
- [ ] **Step 4: Checkpoint.**

---

### Task 6: Proforma editörü

**Files:**
- Create: `desktop/src/pages/ProformaEditor.jsx`, `desktop/src/components/form/ProformaNotes.jsx`
- Modify: `desktop/src/App.jsx`, `desktop/src/components/Preview.jsx`, `desktop/src/lib/strings.js`

**Interfaces:**
- Consumes: `useProforma(id)`, `useRecordPickers`, `FormSection({ letter, ctx, only })`, `Preview`, `buildDownload`, `saveBlob`.
- Produces: `Preview` yeni isteğe bağlı prop'lar: `xlsxKind = "xlsx"` (menüdeki Excel işlemi `onDownload(xlsxKind)`) ve `missing` (verilmezse `missingFields(state)`). Önizleme başlığı `t("pv.proforma")` (yeni anahtar, "Proforma Invoice"; `doc="proforma"`).
- `ProformaEditor({ id, step })`: üst çubuk — geri bağlantısı (`#/proformas`), başlık (`proformaNo` ya da `d.pf.untitled`), kaynak etiketi, "orijinal dosya" düğmesi (`file` varsa), kayıt durumu, önizleme aç/kapa (`lgx.preview` tercihini paylaşır), şirket/banka/antet seçicileri (`useRecordPickers`). Adımlar sol sütunda: `general` = A(yalnızca `meta.proformaNo meta.proformaDate meta.orderRef meta.currency`), B, C(yalnızca `shipment.incoterm shipment.incotermPlace shipment.paymentTerms shipment.transportMode shipment.portLoading shipment.portDischarge shipment.countryOrigin shipment.countryDestination`); `items` = D, E; `bank` = G, H(yalnızca `sign.name sign.title sign.place`), `ProformaNotes`. Yüklenen kayıtta `general` adımında `ParseReport` (Editor'daki gibi kapatılabilir). `ctx` Editor'dakiyle aynı şekil (`state, auto, update, lh, T, itemView: "invoice", setItemView, placeholders`); `placeholders` yalnızca `charges.vat` içerir.
- `ProformaNotes({ ctx })`: `proforma.notes` için etiketli textarea (`setField(ctx, "proforma.notes", v)`).
- İndirme: PDF `buildDownload("proforma", state, lh)`, Excel `buildDownload("proforma-xlsx", state, lh)`. Antet profil hatırlatma mantığı (Editor.onDownload) **taşınmaz**.
- Kayıt bulunamazsa Editor'daki "missing" boş durumu kalıbı (`d.editor.missing` yeniden kullanılır, bağlantı `#/proformas`).

- [ ] **Step 1:** Sayfayı, notlar bileşenini, `Preview` prop'larını, `App.jsx` `proformaEditor` dalını ve çevirileri ekle. Önizleme eksik alan listesi `missingProforma(state)` ile verilir.
- [ ] **Step 2:** `node scripts/check-i18n.mjs`, `npm run build`.
- [ ] **Step 3:** CDP: Yeni proforma → alıcı, kalem, banka doldur → önizleme "PROFORMA INVOICE" gösterir ve canlı güncellenir; PDF ve Excel indirilir (`LGX_TEST_DIR`), Excel'de kalem formülleri var; sayfayı yeniden açınca veri kalıcı; şirket seçince satıcı/banka dolar; TR↔EN değişince ondalık ayırıcı dönüşür; kalemsiz/alıcısız proformada önizleme eksik alan uyarısı verir, çökmez; sevkiyat editörü (`Preview` varsayılanlarıyla) etkilenmedi.
- [ ] **Step 4: Checkpoint.**

---

### Task 7: Dosya yükleme (içe aktarma)

**Files:**
- Modify: `desktop/src/lib/proforma-records.js` (`importProformaFile`), `desktop/src/pages/Proformas.jsx`, `desktop/src/lib/strings.js`

**Interfaces:**
- Consumes: `parseProforma(file)` (`@engine/parse/index.js`), `applyParsed(res, { prev, profile })`, `buildParseSummary(name, res)` (`ParseReport.jsx`).
- Produces: `importProformaFile(file: File, { prev, profile }): Promise<{ state, auto: Set, parse, file: { name, type, size, blob } }>` — `applyParsed` sonucundaki `meta.invoiceNo`'yu `""` yapar (CI numarası önerisi proformaya ait değil); `file.blob` yüklenen `File`'ın kendisi (`Blob`).
- `Proformas.jsx`: "Dosya yükle" düğmesi gizli `<input type="file" accept=".pdf,.xlsx,.xlsm,.xls,.csv,.ods,.docx,application/pdf">` açar; ayrıca liste alanına dosya sürükle-bırak. Okuma sürerken düğme meşgul; hata olursa satır içi hata (`e.key ? t(e.key, e.vars) : t("warn.failed", { msg })`) gösterilir ve **kayıt oluşturulmaz**; başarıda kayıt `source: "imported"` ile kaydedilir ve `go("/pf/<id>")` açılır (editörde `ParseReport` görünür).

- [ ] **Step 1:** `importProformaFile` ve arayüz bağlantısını yaz; devre dışı düğmeyi etkinleştir.
- [ ] **Step 2:** `node scripts/check-i18n.mjs`, `npm run build`.
- [ ] **Step 3:** CDP: `test_document/Proforma Fatura.pdf` yükle → kayıt `imported`, kalemler/taraflar dolu, `ParseReport` görünür, editörde "orijinal dosya" açılır ve PDF'in kendisidir; boş/bozuk bir dosya (ör. 0 baytlık `.pdf`) yükle → hata görünür, listedeki kayıt sayısı değişmez; yüklenen kaydı düzenle ve PDF/Excel indir.
- [ ] **Step 4: Checkpoint.**

---

### Task 8: Yeni sevkiyatta proforma seçici ve bağlantılar

**Files:**
- Create: `desktop/src/components/ProformaPicker.jsx`
- Modify: `desktop/src/pages/NewShipment.jsx`, `desktop/src/pages/Editor.jsx`, `desktop/src/lib/strings.js`

**Interfaces:**
- Consumes: `shipmentFromProforma(pf, { lhId, companyId })` (Task 5), `app.proformas`, `app.saveShipment`.
- Produces: `ProformaPicker({ onPick(pf) })` — arama kutusu + tüm proformaların kısa listesi (no, alıcı, tutar, "N sevkiyat" etiketi, "Seç" düğmesi); liste boşsa ipucu ve `#/proformas` bağlantısı.
- `NewShipment.jsx`: yükleme bölümünün altında "Proformalarımdan seç" bölümü; seçince `shipmentFromProforma(pf, { companyId: company ? company.id : undefined, lhId: lh ? lh.id : undefined })` — **sayfadaki şirket/antet seçimi doluysa o kazanır, değilse proformanınki**; kaydet, `go("/s/<id>")`. Proforma daha önce sevkiyata çevrildiyse seçicide etiket görünür (engellenmez).
- `Editor.jsx` üst çubuğu: `sh.meta.proformaId` varsa ve `app.getProforma(id)` kaydı varsa `#/pf/<id>` bağlantısı ("Proforma: <no>"); kayıt yoksa bağlantısız "silinmiş proforma" metni.

- [ ] **Step 1:** Seçici, `NewShipment` bölümü ve `Editor` bağlantısını yaz; çeviriler.
- [ ] **Step 2:** `node scripts/check-i18n.mjs`, `npm run build`.
- [ ] **Step 3:** CDP: proforma seç → sevkiyat editöründe kalemler/taraflar/Incoterm/para birimi/banka/imza dolu, `proformaNo/Date` dolu, fatura no önerisi dolu (proforma no yoksa boş), `plNo` boş, fatura tarihi bugün; üst çubukta proforma bağlantısı çalışır; sevkiyatı düzenle → proforma değişmedi; aynı proformayı tekrar seç → ikinci bağımsız sevkiyat, proforma listesinde "2"; proformayı sil → ilk sevkiyatı aç: çökmeden "silinmiş proforma" yazar; sevkiyatı sil → proforma listesinde sayı düşer (türetilmiş).
- [ ] **Step 4: Checkpoint.**

---

### Task 9: Bütünleşik doğrulama

**Files:** değişiklik yok (yalnızca bulgu çıkarsa ilgili görevin dosyaları).

- [ ] **Step 1:** `cd desktop && npm run test:proforma && npm run test:backup && npm run test:planner && npm run test:landed && npm run test:notes && node scripts/check-i18n.mjs && npm run build` — Expected: hepsi hatasız/PASS.
- [ ] **Step 2:** Yedek uçtan uca (CDP): proformalı + yüklenmiş dosyalı veriyle yedek al, eski formatlı (proformasız) bir yedeği yükle (hata yok), proformalı yedeği boş profile yükle (proformalar ve orijinal dosya Blob'u geri gelir).
- [ ] **Step 3:** Review Focus maddelerinin her biri için ilgili görevde yazılan adımın sonucunu tek tek işaretle; açık kalan varsa düzelt. Spec'teki hedef/anti-hedef listesine karşı son tarama: proforma sevkiyat listesine karışmıyor, yüklenen dosya yedekte düşmüyor, dış ağ isteği yok.
- [ ] **Step 4:** Kullanıcıya bildir: yapılanlar, test sonuçları, değişen dosya listesi; commit/etiket kullanıcıda. `~/Library/Application Support/logisticedo` klasörüne test için dokunulduysa ne yapıldığını söyle.
