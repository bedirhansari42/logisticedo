# Konteyner planlayıcı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Masaüstü uygulamasına, karışık kutu/palet listesini 20', 40' ve 40' HC konteynerlere yerleştirip tepeden/3D/katman çizimi ve PDF yükleme planı veren bağımsız bir "Konteyner planı" sayfası eklemek.

**Architecture:** Saf (DOM'suz) bir yerleştirme motoru `desktop/src/planner/*.mjs` içinde yaşar ve `node --test` ile test edilir; React sayfası motoru bir Web Worker üzerinden çağırır. Çizimler bağımlılıksız SVG'dir (izometrik 3D dahil). PDF, motorun mevcut `pdf-lib` + IBM Plex Sans yükleyicisiyle (`@engine/loader.js`) üretilir.

**Tech Stack:** React 19 + Vite 8 (mevcut), Electron (mevcut), `node:test` (yeni bağımlılık yok), pdf-lib (vendor/).

**Spec:** `docs/superpowers/specs/2026-11-11-container-planner-design.md`

**Not:** Klasör git deposu değildir; bu yüzden planda commit adımı yoktur. Her görev bir doğrulama komutuyla biter.

## Global Constraints

- Yeni npm bağımlılığı yok; 3D çizim için dış kütüphane yok; veri cihazdan çıkmaz, dış ağ isteği yok.
- Birimler: ölçü cm, ağırlık kg. Koordinat: x = konteyner boyu (0 = arka duvar, `L` = kapı), y = en, z = yükseklik.
- Konteyner iç ölçüleri (cm, uzunluk × genişlik × yükseklik): 20' = 590 × 235 × 239; 40' = 1203 × 235 × 239; 40' HC = 1203 × 235 × 270.
- Paletli yük üst üste konmaz ve üstüne hiçbir şey (paletsiz kutu dahil) konmaz. Paletli kalem ölçüsü palet yüksekliğini içerir; yalnızca dik durur (yükseklik sabit), yatayda 90° döner.
- Paletsiz kutu varsayılan 6 yöne döner; kalemde "dik dursun" işaretliyse yükseklik kilitlenir. Konteyner tavanına kadar istiflenir.
- İstifte havada asılı kutu olmaz: tabanı altındakilerce tamamen desteklenir. Boşluk payı varsayılan 0 cm, ayarlanabilir.
- Yükleme sırası fiziksel olarak uygulanabilir: arka duvardan kapıya doğru, istifler alttan üste.
- Ağırlık sınır değildir; kalemde isteğe bağlıdır, yalnızca toplam gösterilir.
- Adet boş bırakılan tek kalem "olabildiğince çok" kipindedir: diğer kalemler önce yerleşir, bu kalem kalan boşluğu doldurur. İkinci bir boş adetli kalem kabul edilmez.
- Her konteyner tipi (20', 40', 40' HC) bağımsız sonuçtur. Birden fazla konteyner gerekirse kalemler yükleme sırasına göre ilk sığdığı konteynere konur.
- Hiçbir konteynere sığmayan kalem "yerleştirilemez" işaretlenir, kalanlar planlanır; yerleşemeyenler nedeniyle listelenir; sonuç "tahmini plan" notuyla gösterilir.
- Kapasite: ~2000 birim ve 50 satıra kadar rahat çalışır; çizimde her kutu çizilir ama bir görünümdeki SVG düğüm sayısı sınırlandırılır (bkz. Görev 4).
- TR + EN arayüz (anahtarlar `desktop/src/lib/strings.js`, önek `d.pl.`; `node scripts/check-i18n.mjs` geçmeli). PDF belgesi İngilizce, antetsiz, IBM Plex Sans.
- Taslak (girilen liste ve ayarlar) `localStorage` anahtarı `lgx.planner` altında saklanır, her okuma/yazma try/catch içinde; kayıtlı plan geçmişi yok.
- Auros teması: yeni stil yalnızca `desktop/src/styles/dash.css` içindeki mevcut sınıf/ değişkenlerle uyumlu eklenir.

## Review Focus

- Ondalık virgül ("1,5") ve boş/0/negatif/sayı olmayan ölçü ya da adet: satır geçersiz sayılır, plan çökmez, satır hatası gösterilir (Görev 3).
- Boş liste ya da tüm satırları geçersiz liste: "yerleştirilecek kalem yok" durumu, hata değil (Görev 2, 3).
- Paletsiz kutu bir yönde konteynerden büyük ama döndürülünce sığıyor; aynı ölçüdeki paletli kalem sığmıyor (Görev 2).
- "Olabildiğince çok" kaleminde boş yer kalmamış (0 sığar) ya da iki kalemde işaret var (Görev 2, 3).
- Çok büyük adet (ör. 100000 küçük kutu): hesap tavan uyarısıyla sınırlanır, arayüz donmaz (Görev 2, 3).
- Yalnızca paletli liste: 40' HC'nin ekstra yüksekliği boşa gider, sonuç yine geçerli ve doluluk doğru (Görev 2).

---

## File Structure

| Dosya | Sorumluluk |
|---|---|
| `desktop/src/planner/containers.mjs` | Konteyner tanımları |
| `desktop/src/planner/validate.mjs` | `validatePlan`: bir planın kurallara uygunluğunu denetler (testlerin ve motorun hakemi) |
| `desktop/src/planner/pack.mjs` | `planLoad`: yerleştirme motoru |
| `desktop/src/planner/items.mjs` | Satır girdisini ayrıştırma/doğrulama (`parseItemRow`), taslak (de)serileştirme |
| `desktop/src/planner/worker.mjs` | Web Worker sarmalayıcı |
| `desktop/src/planner/*.test.mjs` | `node --test` testleri |
| `desktop/src/planner/pdf.js` | `buildPlanPdf` |
| `desktop/src/pages/Planner.jsx` | Sayfa: form, özet, sekmeli çizim, indirme |
| `desktop/src/components/planner/PlanViews.jsx` | `TopView`, `LayerView`, `IsoView` (SVG) |
| Değişen: `router.js`, `App.jsx`, `Sidebar.jsx`, `Icons.jsx`, `strings.js`, `dash.css`, `package.json` | Yönlendirme, menü, ikon, metinler, stil, `test:planner` betiği |

---

### Task 1: Konteynerler ve plan doğrulayıcı

**Files:**
- Create: `desktop/src/planner/containers.mjs`, `desktop/src/planner/validate.mjs`
- Test: `desktop/src/planner/validate.test.mjs`
- Modify: `desktop/package.json` (script `"test:planner": "node --test src/planner/"`)

**Interfaces:**
- Produces:
  - `CONTAINERS: { "20": {key, label, L, W, H}, "40": …, "40hc": … }` (labels `"20'"`, `"40'"`, `"40' HC"`; değerler Global Constraints'teki gibi).
  - Tip `Placement = { itemId: string, x, y, z, dx, dy, dz: number, pallet: boolean, seq: number }` (dx/dy/dz yönlendirilmiş boyutlar; `seq` 1'den başlar, benzersiz).
  - `validatePlan(container: {L,W,H}, placements: Placement[], opts?: {gap?: number}) -> { ok: boolean, errors: string[] }`. Hata türleri: sınır dışı, çakışma (gap dikkate alınarak), paletli yükün üstünde yük, havada asılı (tabanın tamamı z=0 ya da tabanı tam kaplayan üst yüzeyler üzerinde değil), yükleme sırası ihlali.
  - Yükleme sırası kuralı (hakem): `seq` sırasıyla bakıldığında, her yerleşimin altında onu taşıyan her yerleşim ondan önce gelmeli; ve her yerleşim `i` için, daha önce gelen hiçbir `j` (y ve z aralıkları `i` ile kesişen) `i`'nin kapıya bakan yüzünün (`i.x + i.dx`) ötesinde (`j.x >= i.x + i.dx`) olmamalı.

- [ ] **Step 1: `validate.test.mjs` içine başarısız testleri yaz** — elle kurulmuş küçük planlarla her hata türü için biri ve geçerli bir plan için biri: `valid plan passes`, `box outside container is rejected`, `overlapping boxes are rejected`, `item on top of a pallet is rejected`, `floating box is rejected`, `box on fully supporting boxes passes`, `box on partially supporting box is rejected`, `loading before support is rejected`, `earlier item nearer the door that overlaps in y/z is rejected`, `gap=2 makes touching boxes invalid`.
- [ ] **Step 2: Çalıştır, başarısız olduğunu gör.** Run: `cd desktop && node --test src/planner/` — Expected: FAIL (modül yok).
- [ ] **Step 3: `containers.mjs` ve `validate.mjs` dosyalarını yukarıdaki imzalarla yaz.** Destek denetimi için altta kalan yerleşimlerin üst yüzleri `z`'ye eşit olanlarla örtüşme alanı toplamı taban alanına eşit olmalı (kayan nokta toleransı 1e-6); örtüşmeler birbirinden bağımsız olduğundan toplam güvenlidir.
- [ ] **Step 4: Testleri çalıştır.** Run: `cd desktop && npm run test:planner` — Expected: PASS (tümü).

---

### Task 2: Yerleştirme motoru

**Files:**
- Create: `desktop/src/planner/pack.mjs`
- Test: `desktop/src/planner/pack.test.mjs`

**Interfaces:**
- Consumes: `CONTAINERS`, `validatePlan` (Görev 1).
- Produces:
  - Tip `Item = { id: string, name: string, l, w, h: number, qty: number | null, palletized: boolean, upright: boolean, weight?: number }` (`qty: null` = olabildiğince çok; `weight` birim başı kg).
  - `planLoad(items: Item[], containerKey: "20"|"40"|"40hc", opts?: { gap?: number, maxUnits?: number }) -> PlanResult`
  - `PlanResult = { containerKey, containers: ContainerPlan[], unplaced: { itemId: string, count: number, reason: "too_big"|"no_space"|"cap" }[], fill: { itemId: string, count: number } | null, capped: boolean }`
  - `ContainerPlan = { index: number, placements: Placement[], usedVolumeCm3: number, fillPct: number, weightKg: number }` (`fillPct` kullanılan hacim / iç hacim × 100, 1 ondalık).
  - `opts.maxUnits` varsayılan 5000; toplam adet bunu aşarsa fazlası `unplaced` içinde `reason: "cap"` ile döner ve `capped: true`.
  - Aynı girdi her zaman aynı çıktıyı verir (rastgelelik yok).

**Algoritma kuralları (yöntem builder'ın):** Birimler yükleme sırasıyla art arda yerleştirilir; her yeni birim, o ana kadar yerleşenlere göre (Görev 1'deki destek ve sıra kurallarını sağlayan) bir konuma konur. Böylece her plan `validatePlan`'dan geçmeli. Sıra: paletliler ve büyük taban alanlı kutular önce, `seq` yerleşim sırasıdır. Çok konteyner gerekiyorsa sığmayan birim sıradaki konteynerde denenir. Fill kalemi en sonda, her konteynerde kalan boşluk dolana kadar yerleştirilir; fill kipinde yalnızca ilk konteyner kullanılır ve `fill.count` o konteynerdeki adettir.

- [ ] **Step 1: Başarısız testleri yaz** (`pack.test.mjs`); her planı ayrıca `validatePlan` ile denetle:
  - `single 100x100x100 box x1 fits in 20'` (bir yerleşim, `unplaced` boş).
  - `pallets stay on the floor`: paletli 120×80×100, adet 20, 40' → hepsi yerleşir ve her `placement.z === 0`.
  - `palletized item is never stacked` (20 paletli, tüm z = 0 ve hiçbir yerleşim bir paletin üstüne gelmez).
  - `unpalletized boxes stack up to the ceiling`: 50×50×50 kutu × çok → 20'te en az bir yerleşimin `z + dz` değeri `H`'nin üst %80'ine ulaşır (`z + dz > 0.8*H`).
  - `rotates a box that only fits turned`: 250×40×40 kutu (250 > W=235, yataya sığmaz) → yerleşir (boy `L` boyunca); aynı ölçüde paletli → `unplaced[0].reason === "too_big"`.
  - `upright box keeps its height`: `upright:true` kalemde her `dz === h`.
  - `item bigger than every container is too_big and others still planned`.
  - `quantity splits across several containers`: 20' için yüklenemeyecek kadar çok adet → `containers.length > 1`, her birinin planı geçerli.
  - `fill mode`: tek kalem `qty:null` → `fill.count > 0`; `fill + fixed items`: sabit kalemler önce yerleşir, sayı sabit kalemler yokken olandan küçük ya da eşit.
  - `fill mode with no free space returns 0`: tüm hacmi dolduran sabit kalem + fill kalem → `fill.count === 0`.
  - `two fill items are rejected` (`planLoad` bir hata fırlatır, mesaj `"only one fill item"` içerir).
  - `empty list returns empty result` (hata yok, `containers: []`).
  - `only palletized list on 40hc stays valid and fillPct is volume based`.
  - `cap`: 100000 küçük kutu → `capped === true`, `unplaced` içinde `reason: "cap"`, çağrı 5 saniyeden kısa sürer.
  - `deterministic`: aynı girdi iki kez → `deepEqual`.
  - `performance`: ~2000 karışık birim, 40hc → 3 saniyeden kısa.
  - `property`: sabit tohumlu 30 rastgele liste (en fazla 50 satır, ölçüler 10–120 cm) → her sonuç `validatePlan` geçer ve yerleşen + yerleşemeyen adet toplamı girilen adede eşit.
- [ ] **Step 2: Çalıştır, başarısız olduğunu gör.** Run: `cd desktop && node --test src/planner/pack.test.mjs` — Expected: FAIL (modül yok).
- [ ] **Step 3: `planLoad`'u `pack.mjs` içinde yukarıdaki imza ve kurallarla yaz.** Öneri: uç nokta (extreme point) tabanlı yerleştirme; adaylar `x` sonra `z` sonra `y` artan sırayla denenir, kısa devre için taban alanı aynı satırlar gruplanır. Performans testi geçmiyorsa aday sayısını sınırla.
- [ ] **Step 4: Tüm planner testlerini çalıştır.** Run: `cd desktop && npm run test:planner` — Expected: PASS.

---

### Task 3: Sayfa, form, taslak, worker, özet

**Files:**
- Create: `desktop/src/planner/items.mjs`, `desktop/src/planner/worker.mjs`, `desktop/src/pages/Planner.jsx`
- Test: `desktop/src/planner/items.test.mjs`
- Modify: `desktop/src/lib/router.js`, `desktop/src/App.jsx`, `desktop/src/components/Sidebar.jsx`, `desktop/src/components/Icons.jsx`, `desktop/src/lib/strings.js`, `desktop/src/styles/dash.css`

**Interfaces:**
- Consumes: `planLoad`, `Item` (Görev 2).
- Produces:
  - `parseItemRow(row: { name, l, w, h, qty, weight, palletized, upright }) -> { ok: true, item: Item } | { ok: false, errors: { field: string, key: string }[] }` — sayıları `"1,5"` ve `"1.5"` biçimlerinde kabul eder; `l,w,h` > 0 zorunlu; `qty` boş = fill, aksi halde tamsayı ≥ 1; `weight` boş ya da ≥ 0. `key` çeviri anahtarıdır (`d.pl.err.*`).
  - `loadDraft() -> { rows: Row[], gap: number, container: string }` ve `saveDraft(draft) -> void` (localStorage `lgx.planner`, hatalar yutulur; bozuk JSON → varsayılan taslak).
  - Rota: `{ name: "planner" }` ← `#/planner`; menü öğesi `["planner", "/planner", "planner", "d.nav.planner"]`; ikon adı `planner` (Icons.jsx `P` sözlüğüne küçük bir SVG).
  - Worker mesajı: `{ items, gap }` → `{ results: { "20": PlanResult, "40": PlanResult, "40hc": PlanResult } }` ya da `{ error: string }`.

**Sayfa davranışı:** Üstte kalem tablosu (satır ekle / sil / çoğalt; sütunlar: ad, uzunluk, genişlik, yükseklik, adet, ağırlık, paletli, dik dursun); satır hataları alan altında. Sonra "boşluk payı (cm)" alanı ve "Planla" düğmesi. Çalışırken `Spinner`. Sonuç: üç konteyner tipi için kart: sığan/yerleşemeyen adet, gereken konteyner sayısı, doluluk %, toplam ağırlık (varsa), fill sonucu; yerleşemeyenler nedenleriyle; "tahmini plan" notu; `capped` ise tavan uyarısı. Kartı seçmek Görev 4'teki çizim alanını o tipe bağlar. Worker açılamazsa (try/catch) hesap ana iş parçacığında yapılır.

- [ ] **Step 1: `items.test.mjs` içine başarısız testleri yaz:** `accepts comma decimals` (`"1,5"` → 1.5), `empty qty means fill`, `rejects zero, negative and non-numeric dimensions with field errors`, `rejects non-integer or zero qty`, `rejects negative weight`, `loadDraft returns defaults when storage is missing or corrupt` (global `localStorage` taklidiyle), `saveDraft swallows storage errors`.
- [ ] **Step 2: Çalıştır, başarısız olduğunu gör.** Run: `cd desktop && node --test src/planner/items.test.mjs` — Expected: FAIL.
- [ ] **Step 3: `items.mjs` dosyasını yaz.**
- [ ] **Step 4: Testleri çalıştır.** Run: `cd desktop && npm run test:planner` — Expected: PASS.
- [ ] **Step 5: `worker.mjs`, `Planner.jsx`, rota/menü/ikon değişiklikleri, `d.pl.*` ve `d.nav.planner` metinlerini (TR+EN) ve gereken stilleri ekle.** İki fill satırı `parseItemRow` düzeyinde değil sayfada engellenir (ikinci boş adette satır hatası `d.pl.err.oneFill`). Boş/geçersiz listede "Planla" pasif, sonuç alanında `d.pl.empty` gösterilir.
- [ ] **Step 6: Doğrula.** Run: `cd desktop && node scripts/check-i18n.mjs && npx vite build` — Expected: i18n denetimi hatasız, build başarılı.
- [ ] **Step 7: Uygulamada elle doğrula** ([[reference-headless-chrome-ui-check]] yöntemiyle CDP; kendi sunucun için 8765 dışında bir port): `npm run start` ile aç, `#/planner`'a git; bir paletli + bir paletsiz kalem gir, "Planla"; üç tip için sonuç kartı çıktığını, `app://` altında worker'ın çalıştığını (konsolda hata yok) kontrol et. Worker `app://` protokolünde açılmazsa ana iş parçacığı yedeğinin devrede olduğunu doğrula ve nedenini kısaca `desktop/README.md`'ye not düş. Test sonrası `~/Library/Application Support/logisticedo` silinmeli.

---

### Task 4: Çizim sekmeleri (tepeden, 3D, katman katman)

**Files:**
- Create: `desktop/src/components/planner/PlanViews.jsx`
- Modify: `desktop/src/pages/Planner.jsx`, `desktop/src/lib/strings.js`, `desktop/src/styles/dash.css`

**Interfaces:**
- Consumes: `PlanResult`, `ContainerPlan`, `Placement`, `CONTAINERS`.
- Produces:
  - `TopView({ container, placements, colorOf, showSeq })`: tepeden görünüm (x yatay, y dikey), her kutu bir dikdörtgen; paletsiz istifte en üstteki kutu çizilir; `showSeq` ise yükleme sırası numarası yazılır.
  - `LayerView({ container, placements, colorOf })`: z düzeylerine (benzersiz `z` değerleri) göre küçük çoklu görünümler; her düzey kendi tepeden planıdır.
  - `IsoView({ container, placements, colorOf })`: izometrik 3D (üst + iki yan yüz tonlaması), arkadan öne ve alttan üste sıralanmış çizim (painter algoritması).
  - `colorOf(itemId) -> string`: aynı kalem aynı renk; palet Auros tonlarından türetilir.
  - Sayfada: seçili konteyner tipi içinde birden fazla konteyner varsa "Konteyner 1/2…" seçici; üç sekme (Tepeden / 3D / Katman katman); lejant (kalem rengi, ad, adet); yükleme sırası numaraları tepeden görünümde varsayılan açık.
  - SVG düğüm sınırı: bir görünümde en fazla 1500 kutu çizilir; aşılırsa aynı kalem ve aynı z'de bitişik kutular tek dikdörtgene birleştirilir ya da alttaki bir not "çizim sadeleştirildi" gösterilir (yöntem builder'ın; plan verisi etkilenmez).

- [ ] **Step 1: Saf yardımcıyı test et.** `PlanViews.jsx` içindeki yerleşimleri gruplayıp düzeylere ayıran yardımcıyı `desktop/src/planner/layers.mjs` olarak çıkar: `groupByLayer(placements) -> { z: number, placements: Placement[] }[]` (z artan). Önce `layers.test.mjs`: `groups by z ascending`, `empty list returns empty array`. Run: `cd desktop && node --test src/planner/layers.test.mjs` — Expected: önce FAIL, sonra yazınca PASS.
- [ ] **Step 2: `PlanViews.jsx` bileşenlerini ve sayfadaki sekmeleri yaz;** metinler `d.pl.*` (TR+EN).
- [ ] **Step 3: Doğrula.** Run: `cd desktop && npm run test:planner && node scripts/check-i18n.mjs && npx vite build` — Expected: hepsi başarılı.
- [ ] **Step 4: Uygulamada elle doğrula (CDP + ekran görüntüsü):** paletli ve istiflenen paletsiz kalemlerle plan; üç sekmede çizimin konteyner sınırları içinde kaldığını, numaraların arka duvardan kapıya arttığını, katman görünümünde en az iki düzey olduğunu, ~2000 birimlik listede arayüzün donmadığını (sekme geçişi 1 saniyeden kısa) gör. Ekran görüntüsünü gözle incele; tema ve taşma sorunlarını düzelt.

---

### Task 5: PDF yükleme planı

**Files:**
- Create: `desktop/src/planner/pdf.js`
- Modify: `desktop/src/pages/Planner.jsx`, `desktop/src/lib/strings.js`

**Interfaces:**
- Consumes: `loadPdfLib`, `loadDocFonts` (`@engine/loader.js`), `saveBlob` (`desktop/src/lib/download.js`), `PlanResult`, `layers.mjs`.
- Produces: `buildPlanPdf(result: PlanResult, items: Item[]) -> Promise<Uint8Array>` — İngilizce, antetsiz, A4. İçerik: başlık "Container Load Plan", konteyner tipi ve iç ölçüler, kalem tablosu (ad, ölçü, adet, paletli, yerleşen/yerleşemeyen), doluluk, "Estimated plan" notu; her konteyner için bir sayfa: tepeden çizim (vektör dikdörtgenler, numaralı), katman sayfaları ve numaralı yükleme sırası tablosu (`seq`, kalem adı, konum x/y/z). Boş sonuç için PDF üretilmez (düğme pasif).
- Dosya adı: `Container-Load-Plan_<40hc|40|20>.pdf`; indirme `saveBlob` ile.

- [ ] **Step 1: `buildPlanPdf`'yi yaz;** pdf-lib vektör çizimi, mevcut `pdf-builder.js`'teki font yükleme (`subset:true` + Plex) yaklaşımını izle; kalem adlarında Plex'in desteklemediği karakterleri `?` ile değiştir.
- [ ] **Step 2: Sayfaya "PDF indir" düğmesini ekle** (seçili konteyner tipi için; hata `toast` ile).
- [ ] **Step 3: Doğrula.** Run: `cd desktop && node scripts/check-i18n.mjs && npx vite build` — Expected: başarılı.
- [ ] **Step 4: Uygulamada elle doğrula:** PDF'i indir (`LGX_TEST_DIR` ile sorusuz kaydolur), `qlmanage` ya da `pdftoppm` ile sayfaya çevirip gözle incele: çizim sayfa içinde, numaralar okunur, tablo taşmıyor, Türkçe karakterli kalem adı bozulmadan ya da `?` ile geliyor. Test dosyalarını ve `~/Library/Application Support/logisticedo` klasörünü temizle.

---

### Task 6: Son denetim

- [ ] **Step 1: Tüm kontrolleri çalıştır.** Run: `cd desktop && npm run test:planner && node scripts/check-i18n.mjs && npx vite build` — Expected: üçü de hatasız.
- [ ] **Step 2: Spec'e göre kontrol listesi:** Global Constraints'in her satırı için ilgili test ya da elle doğrulama adımını işaretle; eksik varsa ilgili göreve dön.
- [ ] **Step 3: `desktop/README.md`'ye "Konteyner planı" için üç satırlık not ekle** (nerede, nasıl test edilir, algoritma sezgiseldir).
