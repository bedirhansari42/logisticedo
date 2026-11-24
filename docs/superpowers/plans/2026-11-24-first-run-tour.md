# İlk açılış tanıtımı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yeni kurulumda ortada kısa bir karşılama penceresi, ardından köşede duran ve sayfayı kilitlemeyen bir rehber kartı: önce antet, şirket, banka kurulumu (veri eklenince otomatik işaretlenir), sonra 5 sayfanın tanıtımı. Ayarlar'dan yeniden başlatılır.

**Architecture:** Tüm karar ve geçiş mantığı DOM'suz `src/tour/model.mjs` (saf, testli) ve kalıcı durum `src/tour/store.mjs` (localStorage `lgx.tour`, `useSyncExternalStore` ile okunur). Arayüz `Tour.jsx` (ana bileşen, `App.jsx`'te), `TourWelcome.jsx` (modal) ve `TourCard.jsx` (yüzen, modal olmayan kart).

**Tech Stack:** React 19, `node --test`, mevcut `dialog` ve tasarım sınıfları.

**Spec:** `docs/superpowers/specs/2026-11-24-first-run-tour-design.md`

## Global Constraints

- Durum anahtarı `lgx.tour`; durumlar: `new`, `welcome`, `setup`, `pages`, `done`; sayfa adımı `page` 0–4.
- Sayfa adımları sırayla: `proformas`, `shipments`, `planner`, `landed`, `notes`; rotalar `/proformas`, `/shipments`, `/planner`, `/landed`, `/notes`.
- Kurulum adımları: `letterhead` → `/letterheads`, `company` → `/companies`, `bank` → `/banks` (şirket yoksa `/companies`).
- Otomatik başlangıç yalnızca durum `new` iken; veri varsa (sevkiyat+proforma+antet+şirket > 0) sessizce `done`.
- Kart sayfayı kilitlemez (`dialog.showModal` kullanılmaz); yalnızca karşılama penceresi modaldır.
- Tanıtım hiçbir veri yazmaz, ağ isteği yapmaz.
- Metinler TR ve EN; `node scripts/check-i18n.mjs` 0 eksik vermeli.
- Git'i kullanıcı elle yönetir: commit atma, gönderme.

## Review Focus

- Güncelleme sonrası zaten verisi olan kullanıcı: tanıtım açılmaz, durum `done` olur. (Task 1)
- `localStorage` bozuk, boş ya da erişilemez: çökme yok; geçersiz kayıt `new` sayılır. (Task 1)
- Tanıtımın ortasında uygulama kapatılıp açılırsa aynı adımdan devam eder. (Task 1: `parseState` gidiş-dönüş)
- Veriler sonradan silinirse tanıtım yeniden başlamaz. (Task 1)
- Şirket yokken banka satırı Şirketler sayfasına gider. (Task 1)
- Başka bir pencere açıkken (ör. güncelleme bildirimi) karşılama pencere üstüne binmez, bekler. (Task 2)
- Dil değişince kart metinleri değişir; kart açıkken sayfalar arasında gezilebilir. (Task 3)
- Ayarlar'dan "yeniden göster" `done` durumundan başlatır. (Task 4)

---

### Task 1: Tanıtım modeli ve kalıcı durum

**Files:**
- Create: `desktop/src/tour/model.mjs`, `desktop/src/tour/store.mjs`
- Test: `desktop/src/tour/model.test.mjs`, `desktop/src/tour/store.test.mjs`
- Modify: `desktop/package.json` (script `"test:tour": "node --test src/tour/*.test.mjs"`)

**Interfaces:**
- Produces (`model.mjs`):
  - `SETUP_STEPS = ["letterhead","company","bank"]`, `PAGE_STEPS = ["proformas","shipments","planner","landed","notes"]`
  - `pageRoute(id: string): string` (`"/proformas"` …), `setupRoute(id: "letterhead"|"company"|"bank", counts: { companies: number }): string`
  - `initialState(): { status: "new", page: 0 }`
  - `parseState(raw: unknown): { status: string, page: number }` — `raw` JSON-string ya da nesne; geçersiz durum/sayfa → `initialState()`; `page` 0–4 tamsayıya sıkıştırılır.
  - `setupStatus(counts: { letterheads: number, companies: number, banks: number }): { letterhead: boolean, company: boolean, bank: boolean, complete: boolean }` (`banks` = tüm şirketlerdeki banka hesabı sayısı toplamı)
  - `autoStartDecision({ state, ready, hasData }: { state: {status:string}, ready: boolean, hasData: boolean }): "none" | "wait" | "markDone" | "start"` — durum `new` değilse `none`; `!ready` ise `wait`; `hasData` ise `markDone`; aksi `start`.
  - `reduce(state, event: "start"|"skipSetup"|"finishSetup"|"next"|"back"|"close"|"restart"): { status, page }` — `restart` (her durumdan) → `welcome`/0; `start` (`welcome`→`setup`); `skipSetup` ve `finishSetup` (`setup`→`pages`/0); `next` (`pages`: son sayfa değilse `page+1`, sonuncuysa `done`); `back` (`pages`: `page>0` ise `page-1`, 0'da aynı kalır); `close` (her durumdan → `done`); geçersiz durumda olay yok sayılır (aynı durum döner); `new` durumuna yalnızca `initialState` döner, hiçbir olay `new` üretmez.
- Produces (`store.mjs`):
  - `TOUR_KEY = "lgx.tour"`, `getTour(): { status, page }`, `subscribeTour(fn: () => void): () => void`, `tourEvent(event: string): void` (yeni durumu hesaplar, kaydeder, dinleyenlere haber verir), `setTourState(state): void` (otomatik başlangıçta `markDone`/`restart` için).

- [ ] **Step 1: Failing tests (`model.test.mjs`)**: `parseState`: `null`, `""`, `"{"`, `'{"status":"garip"}'`, `{status:"setup",page:99}` → `{status:"setup",page:4}`, `{status:"pages",page:-3}` → page 0, `{status:"pages",page:2.7}` → 2; gidiş-dönüş: `parseState(JSON.stringify({status:"pages",page:3}))` aynı; `parseState(42)` → initial. `setupStatus({letterheads:0,companies:0,banks:0})` hepsi false/`complete:false`; `{1,0,0}` yalnızca letterhead; `{1,1,0}` company; `{1,1,2}` `complete:true`; `{0,1,1}` `complete:false`. `autoStartDecision`: `new`+ready+!hasData → `"start"`; `new`+ready+hasData → `"markDone"`; `new`+!ready → `"wait"`; `done`/`setup`/`welcome` → `"none"` (hasData ne olursa olsun). `setupRoute("bank",{companies:0})==="/companies"`, `({companies:1})==="/banks"`, `("letterhead")==="/letterheads"`, `("company")==="/companies"`. `reduce`: `{welcome}`+`start`→setup; `{setup}`+`skipSetup`→`{pages,0}`; `{setup}`+`finishSetup`→`{pages,0}`; `{pages,2}`+`next`→page 3; `{pages,4}`+`next`→`done`; `{pages,0}`+`back`→page 0; `{pages,3}`+`back`→page 2; `close` her durumdan `done`; `{done}`+`restart`→`{welcome,0}`; `{done}`+`next`→`done` (yok sayılır); `{new}`+`start`→`new` (yok sayılır); hiçbir olay `new` döndürmez.
  **(`store.test.mjs`)**: `globalThis.localStorage` Map tabanlı sahte; boşken `getTour()` → `{status:"new",page:0}`; `setTourState({status:"setup",page:0})` sonrası `localStorage` içinde JSON ve `getTour()` aynı; `tourEvent("close")` sonrası `done` ve dinleyici bir kez çağrılır; abonelikten çıkınca çağrılmaz; `localStorage` getter/setter fırlatırsa `getTour()`/`tourEvent` fırlatmaz ve bellekte çalışır; bozuk JSON kayıt → `new`.
- [ ] **Step 2: Run** `cd desktop && node --test src/tour/*.test.mjs` → FAIL (modüller yok).
- [ ] **Step 3: Implement** `model.mjs` (saf) ve `store.mjs` (`backup/auto.mjs` / `update/state.mjs` try/catch kalıbı; bellek önbelleği + dinleyici kümesi; ilk `getTour()` localStorage'dan `parseState` ile okur). `package.json`'a `test:tour` ekle.
- [ ] **Step 4: Run** `npm run test:tour` → PASS.

### Task 2: Metinler, ana bileşen ve karşılama penceresi

**Files:**
- Create: `desktop/src/components/Tour.jsx`, `desktop/src/components/TourWelcome.jsx`
- Modify: `desktop/src/App.jsx` (`<Tour />` `<UpdateNotice />` yanına), `desktop/src/lib/strings.js` (TR+EN)

**Interfaces:**
- Consumes: `getTour`, `subscribeTour`, `tourEvent`, `setTourState` (Task 1); `autoStartDecision`, `initialState` (Task 1); `useApp()` → `{ ready, shipments, proformas, letterheads, companies }`.
- Produces: `Tour()` — `useSyncExternalStore(subscribeTour, getTour)` ile durumu okur. Otomatik başlangıç: `autoStartDecision({ state, ready, hasData })` — `"markDone"` ise `setTourState({status:"done",page:0})`; `"start"` ise `{status:"welcome",page:0}` (karşılama, başka `dialog[open]` varsa kapanana kadar 5 sn'de bir yeniden dener ve o zamana dek durumu `new` bırakır); `status === "welcome"` iken `<TourWelcome />`; `setup`/`pages` iken Task 3'ün `<TourCard />`'ı (bu görevde yer tutucu `null`). `TourWelcome`: `<dialog className="dialog dialog--confirm">` + `showModal()`, başlık, kısa metin, "Başla" (`tourEvent("start")`), "Şimdi değil" (`tourEvent("close")`; Esc de aynı).
- Metin anahtarları (TR / EN), `EXTRA` içinde `d.upd.*` yanına: `d.tour.welcomeTitle` ("logisticedo'ya hoş geldiniz" / "Welcome to logisticedo"), `d.tour.welcomeMsg` ("Üç kısa adımda hazırsınız: antetinizi, şirketinizi ve banka bilgilerinizi ekleyin. Sonra diğer sayfalara göz atacağız. Verileriniz yalnızca bu bilgisayarda kalır." / "You are three short steps from ready: add your letterhead, your company and your bank details. Then we will look at the other pages. Your data stays on this computer."), `d.tour.start` ("Başla"/"Start"), `d.tour.notNow` ("Şimdi değil"/"Not now").

- [ ] **Step 1: Strings** ekle; `node scripts/check-i18n.mjs` çalıştır (anahtarlar henüz kullanılmadığı için sayı değişmeyebilir; amaç iki dilde de eşleşme).
- [ ] **Step 2: Implement `Tour.jsx` ve `TourWelcome.jsx`**; `App.jsx`'e `<Tour />` ekle (`AppProvider` içinde, `useApp` kullanabilsin).
- [ ] **Step 3: Verify:** `npm run build` başarılı; `npm run test:tour` PASS. (Gerçek pencere doğrulaması Task 4'te.)

### Task 3: Yüzen rehber kartı (kurulum ve sayfa adımları)

**Files:**
- Create: `desktop/src/components/TourCard.jsx`
- Modify: `desktop/src/components/Tour.jsx` (yer tutucuyu `<TourCard />` ile değiştir), `desktop/src/lib/strings.js`, `desktop/src/styles/dash.css`

**Interfaces:**
- Consumes: `getTour`/`tourEvent` (Task 1); `setupStatus`, `setupRoute`, `pageRoute`, `SETUP_STEPS`, `PAGE_STEPS` (Task 1); `go(path)` (`src/lib/router.js`); `useApp()` (`letterheads`, `companies`).
- Produces: `TourCard({ state })` — sağ altta sabit, `role="complementary"` `aria-label` metinli, `dialog` değil (sayfa kilitlenmez). `setup`: üç satır (`✓`/`○`, adım adı, "Aç" düğmesi → `go(setupRoute(id, {companies}))`); `setupStatus(...).complete` ise "Hazırsınız" mesajı ve "Devam" (`tourEvent("finishSetup")`); her zaman "Atla" (`tourEvent("skipSetup")`) ve kapat (`tourEvent("close")`). `pages`: `n/5` sayacı, başlık, açıklama, "Sayfaya git" (`go(pageRoute(id))`), "Geri" (`page===0` iken devre dışı) ve "İleri" (son sayfada "Bitir"), kapat. Kart hiçbir veri yazmaz.
- Metin anahtarları (TR / EN): `d.tour.cardSetup` ("Başlarken"/"Getting started"), `d.tour.step.letterhead` ("Antet ekleyin"/"Add a letterhead"), `d.tour.step.letterheadHint` ("Belgeleriniz bu antetli kağıda basılır."/"Your documents are printed on this letterhead."), `d.tour.step.company` ("Şirketinizi ekleyin"/"Add your company"), `d.tour.step.companyHint` ("Satıcı bilgileriniz belgelere otomatik gelir."/"Your seller details fill into documents automatically."), `d.tour.step.bank` ("Banka bilgisi ekleyin"/"Add bank details"), `d.tour.step.bankHint` ("Önce bir şirket gerekir; hesap bilgileri faturalara yazılır."/"A company is needed first; account details go on invoices."), `d.tour.open` ("Aç"/"Open"), `d.tour.allSet` ("Hazırsınız! Şimdi diğer sayfalara göz atalım."/"You are set! Let us look at the other pages."), `d.tour.continue` ("Devam"/"Continue"), `d.tour.skip` ("Atla"/"Skip"), `d.tour.close` ("Kapat"/"Close"), `d.tour.back` ("Geri"/"Back"), `d.tour.next` ("İleri"/"Next"), `d.tour.finish` ("Bitir"/"Finish"), `d.tour.goPage` ("Sayfaya git"/"Go to page"), `d.tour.counter` ("{n}/{total}"), ve beş sayfa için `d.tour.page.<id>.title` / `.text` (`proformas`: "Proforma Faturalar" / "Proforma yükleyin ya da oluşturun; sevkiyata tek tıkla aktarın." — `shipments`: "Sevkiyatlar" / "Her sevkiyat için 17 belgeyi (commercial invoice, packing list, B/L ve diğerleri) üretin, PDF ve Excel indirin." — `planner`: "Konteyner planı" / "Kutu ve paletleri 20', 40' ve 40' HC konteynere yerleştirin; yükleme planını PDF alın." — `landed`: "İthalat maliyeti" / "Navlun, sigorta ve vergileri kalemlere paylaştırıp gerçek maliyeti görün." — `notes`: "Notlar" / "Sevkiyatlarınızla ilgili notları ve görevleri bir panoda tutun."; EN karşılıkları eşdeğer kısa cümleler).

- [ ] **Step 1: Strings** ekle (TR+EN, yukarıdaki anahtarlar); `node scripts/check-i18n.mjs` → 0 eksik.
- [ ] **Step 2: Implement `TourCard.jsx`** ve `Tour.jsx`'e bağla. Adım işareti her render'da `setupStatus` ile türetilir (ayrı durum yok).
- [ ] **Step 3: CSS** (`dash.css`): `.tour-card` sağ altta (`position: fixed; right: 20px; bottom: 20px; width: min(340px, calc(100vw - 24px)); z-index: 40`), yüzey rengi ve kenarlıkla mevcut `.card-block` diline uyar; satırlar için `.tour-row`; koyu ve açık temada okunur.
- [ ] **Step 4: Verify:** `npm run build` başarılı; `npm run test:tour` PASS.

### Task 4: Ayarlar, belgeler ve uçtan uca doğrulama

**Files:**
- Modify: `desktop/src/pages/Settings.jsx`, `desktop/src/lib/strings.js`, `desktop/README.md`

**Interfaces:**
- Consumes: `tourEvent` (Task 1).
- Metin anahtarları (TR / EN): `d.set.tour` ("Tanıtım"/"Intro"), `d.set.tourText` ("İlk açılışta gösterilen tanıtımı yeniden izleyin."/"Watch the first-run introduction again."), `d.set.tourRestart` ("Tanıtımı yeniden göster"/"Show the introduction again").

- [ ] **Step 1: Strings** ekle; `check-i18n` → 0 eksik.
- [ ] **Step 2: Settings.jsx:** "Güncellemeler" kartından önce küçük "Tanıtım" kartı, düğme `tourEvent("restart")` çağırıp `go("/")` ile panele döndürür.
- [ ] **Step 3: `desktop/README.md`:** kısa "İlk açılış tanıtımı" bölümü (ne zaman çıkar, Ayarlar'dan yeniden açma, `lgx.tour` anahtarı, testler `npm run test:tour`).
- [ ] **Step 4: Tüm testler:** `cd desktop && for t in net update tour planner landed foc proforma backup notes; do npm run test:$t 2>&1 | grep -E "ℹ (pass|fail)"; done` → hepsinde `fail 0`; `node scripts/check-i18n.mjs` → 0 eksik; `npm run build` başarılı.
- [ ] **Step 5: Elle uçtan uca (gerçek Electron, kullanıcı profiline dokunmadan; sunucu 8765 yerine gerekirse 8799):** scratchpad'de `--user-data-dir` ile taze profil, `--remote-debugging-port` ve CDP. Taze profilde arayüz İngilizce açılır. Beklenen: (a) ~2 sn içinde "Welcome to logisticedo" penceresi; (b) "Start" → sağ altta "Getting started" kartı, üç satır ○, pencere kapanır ve arkadaki sayfa tıklanabilir (kilit yok); (c) "Open" ilgili sayfaya (`#/letterheads`) gider ve kart kalır; (d) Şirketler sayfasından bir şirket (adı yeterli) eklenince kartta "Add your company" satırı ✓ olur; banka satırının "Open"ı şirket varken `#/banks`, yokken `#/companies`'e gider; (e) üç satır ✓ olunca "You are set" ve "Continue" çıkar; "Continue" → sayfa kartı 1/5, "Go to page" `#/proformas`'a gider, "Next" ile 5/5'e, "Finish" ile kart kaybolur; (f) uygulama yeniden yüklenince (reload) tanıtım çıkmaz (`lgx.tour` `done`); (g) Ayarlar → "Show the introduction again" karşılamayı yeniden açar; (h) ortasında yeniden yüklenince (ör. `setup` iken) kart aynı adımda geri gelir; (i) verisi olan bir profilde (şirket kaydedilmiş, `lgx.tour` silinmiş) yeniden açınca tanıtım çıkmaz ve `lgx.tour` `done` olur. Sonra profili sil.
