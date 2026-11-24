# Güncelleme bildirimi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Masaüstü uygulaması açılınca GitHub'daki en son kararlı release yüklü sürümden yeniyse "Yeni sürüm hazır" penceresi çıksın (İndir / Sonra / Bu sürümü atla); Ayarlar'daki sürüm numarası yüklü uygulamanın gerçek sürümü olsun.

**Architecture:** Ağ isteğini ana süreç yapar (`update-main.js`, IPC ile `lgxUpdate` köprüsü); ağ kilidine yalnızca tek GitHub API adresi eklenir. Sürüm karşılaştırma ve karar mantığı DOM'suz `src/update/*.mjs` dosyalarındadır (testli). Arayüz `UpdateNotice.jsx` (BackupReminder desenini izler) ve Ayarlar'da bir kart ekler.

**Tech Stack:** Electron (ana süreç, `net.fetch`), React 19, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-24-update-notice-design.md`

## Global Constraints

- Repo sabiti: `bedirhansari42/logisticedo`. İzinli tek dış adres: `https://api.github.com/repos/bedirhansari42/logisticedo/releases/latest` (tam eşleşme, GET).
- Yalnızca kararlı release (ön sürüm `-rc/-beta/-alpha` ve taslak bildirilmez).
- İstek zaman aşımı 8 sn; her hata sessizce "güncel/denetlenemedi" olur, hiçbir zaman çökme ya da pencere çıkarmaz.
- Arayüz (renderer) hiçbir dış adrese erişmez; "İndir" yalnızca `https://github.com/bedirhansari42/logisticedo/releases...` adreslerini açar.
- localStorage anahtarları: `lgx.update.enabled` (varsayılan açık), `lgx.update.skip`.
- `LGX_UPDATE_URL` yalnızca `app.isPackaged === false` iken geçerli.
- Yeni ana süreç dosyası `desktop/package.json` `build.files` listesine eklenmeli (yoksa paketli uygulama açılmaz).
- Metinler TR ve EN; `node scripts/check-i18n.mjs` 0 eksik vermeli.
- Git'i kullanıcı elle yönetir: commit atma, gönderme.

## Review Focus

- GitHub 404 / 403 (hız sınırı) / HTML ya da bozuk JSON döner: pencere çıkmaz, hata satırı yalnızca elle denetlemede görünür. (Task 4)
- İnternet yok ya da istek 8 sn'de bitmez: uygulama normal açılır, pencere yok. (Task 4)
- Etiket bozuk (`latest`, `v1.2`, `1.2.3.4`) ya da ön sürüm: bildirilmez. (Task 1)
- Yüklü sürüm rc (`1.1.0-rc.1`), yayında `1.1.0` var: bildirilir; yüklü sürüm yayındakinden yeniyse (geliştirme): bildirilmez. (Task 1)
- `html_url` başka bir siteyi gösterir: release yok sayılır, "İndir" açmaz. (Task 3, 4)
- Anahtar kapalıyken otomatik denetim hiç istek göndermez. (Task 2, 5: `api.test.mjs`)
- Atlanan sürümden sonra daha yeni sürüm çıkınca pencere yine çıkar. (Task 2)
- Başka pencere (ör. yedek hatırlatıcı) açıkken üstüne binmez, sonra tekrar dener. (Task 5)

---

### Task 1: Sürüm ayrıştırma ve karşılaştırma

**Files:**
- Create: `desktop/src/update/version.mjs`
- Test: `desktop/src/update/version.test.mjs`
- Modify: `desktop/package.json` (script `"test:update": "node --test src/update/*.test.mjs"`)

**Interfaces:**
- Produces:
  - `parseVersion(input: unknown): { core: [number, number, number], pre: string } | null` — `"1.2.3"`, `"v1.2.3"`, `"1.2.3-rc.1"` kabul; boşluk kırpılır; `"1.2"`, `"1.2.3.4"`, `"latest"`, sayı dışı, `+build` içeren ve string olmayan girdi `null`.
  - `normalizeVersion(input: unknown): string | null` — baştaki `v` atılmış hâl (`"v1.2.0"` → `"1.2.0"`, `"1.2.0-rc.1"` korunur), ayrıştırılamıyorsa `null`.
  - `isNewer(latest: unknown, current: unknown): boolean`

- [ ] **Step 1: Failing tests** (`version.test.mjs`, `node:test` + `assert/strict`): `parseVersion("v1.2.3")` → `{core:[1,2,3],pre:""}`; `parseVersion("1.2.3-rc.1").pre === "rc.1"`; `null` döner: `"1.2"`, `"1.2.3.4"`, `"latest"`, `""`, `null`, `42`, `"1.2.3+b"`. `isNewer("v1.2.0","1.1.9")` true; `("1.1.9","1.2.0")` false (geliştirme sürümü yayındakinden yeni); eşit sürüm false; `("v1.0.10","1.0.9")` true (sayısal, metin sırası değil); `("1.2.0-rc.1","1.1.0")` false (ön sürüm bildirilmez); `("1.1.0","1.1.0-rc.1")` true; `("1.1.0-rc.2","1.1.0-rc.1")` false; `("latest","1.0.0")` ve `("1.0.0","garip")` false. `normalizeVersion("v1.2.0")==="1.2.0"`, `normalizeVersion("x")===null`.
- [ ] **Step 2: Run** `cd desktop && node --test src/update/version.test.mjs` → FAIL (modül yok).
- [ ] **Step 3: Implement** `version.mjs`: tek düzenli ifade `^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$`; `isNewer`: ayrıştırılamıyorsa ya da `latest.pre !== ""` ise false; çekirdekleri sırayla sayısal karşılaştır; çekirdek eşitse yalnızca `current.pre !== ""` ise true.
- [ ] **Step 4: Run** aynı komut → PASS; `package.json`'a `test:update` scriptini ekle.

### Task 2: Ayar ve karar durumu

**Files:**
- Create: `desktop/src/update/state.mjs`
- Test: `desktop/src/update/state.test.mjs`

**Interfaces:**
- Consumes: `normalizeVersion`, `isNewer` (Task 1).
- Produces:
  - `ENABLED_KEY = "lgx.update.enabled"`, `SKIP_KEY = "lgx.update.skip"`
  - `isEnabled(): boolean` (kayıt `"0"` değilse true; localStorage yoksa/hata verirse true)
  - `setEnabled(on: boolean): void`
  - `loadSkipped(): string`, `skipVersion(version: string): void`
  - `shouldNotify({ latest, current, skipped, dismissed }: { latest: string, current: string, skipped: string, dismissed: string }): boolean` — `isNewer(latest,current)` ve `normalizeVersion(latest)` ne `skipped` ne `dismissed` ise true.

- [ ] **Step 1: Failing tests:** testte `globalThis.localStorage`'ı Map tabanlı sahte ile kur. `isEnabled()` boşken true; `setEnabled(false)` sonrası false, `setEnabled(true)` sonrası true; `localStorage` getter'ı fırlatırsa `isEnabled()` true ve `setEnabled` fırlatmaz. `skipVersion("v1.2.0")` sonrası `loadSkipped()==="1.2.0"`. `shouldNotify`: yeni sürüm, boş skipped/dismissed → true; `skipped:"1.2.0"` ve latest `"v1.2.0"` → false; aynı skipped ile latest `"v1.3.0"` → true (atlanan sürümden sonra yenisi); `dismissed:"1.2.0"` → false; latest eski/eşit → false.
- [ ] **Step 2: Run** `node --test src/update/state.test.mjs` → FAIL.
- [ ] **Step 3: Implement** `state.mjs`, `backup/reminder.mjs` ile aynı try/catch'li localStorage kalıbı.
- [ ] **Step 4: Run** → PASS.

### Task 3: Ağ politikası: tek GitHub adresi ve release adresi denetimi

**Files:**
- Modify: `desktop/net-policy.js`
- Test: `desktop/net-policy.test.js`

**Interfaces:**
- Produces (dışa aktarılır):
  - `REPO = "bedirhansari42/logisticedo"`, `UPDATE_API_URL = "https://api.github.com/repos/bedirhansari42/logisticedo/releases/latest"`
  - `isReleaseUrl(url: string): boolean` — ayrıştırılmış adres: `https:`, host tam `github.com`, port yok, `pathname` `/bedirhansari42/logisticedo/releases` ya da `/bedirhansari42/logisticedo/releases/...`; kimlik bilgisi (`user@`) olan adres false.
  - `isAllowed(url, { scheme, devUrl, updateUrl = UPDATE_API_URL })` — mevcut kurallara ek olarak `url === updateUrl` true.

- [ ] **Step 1: Failing tests** (`net-policy.test.js` içine, mevcut `o` ile): `isAllowed(UPDATE_API_URL, o)` true; false: `UPDATE_API_URL + "?x=1"`, `"https://api.github.com/repos/bedirhansari42/logisticedo/releases"`, `"https://api.github.com/repos/baska/repo/releases/latest"`, `"http://api.github.com/repos/bedirhansari42/logisticedo/releases/latest"`, `"https://api.github.com.evil.com/repos/bedirhansari42/logisticedo/releases/latest"`. Özel `updateUrl: "http://localhost:8799/latest.json"` verilince yalnızca o tam adres true. Mevcut "every external host is blocked" testi bozulmamalı. `isReleaseUrl`: true `https://github.com/bedirhansari42/logisticedo/releases/tag/v1.2.0` ve `.../releases`; false `https://github.com/bedirhansari42/logisticedo`, `https://github.com/baska/logisticedo/releases/tag/v1`, `https://github.com.evil.com/bedirhansari42/logisticedo/releases`, `http://github.com/...`, `https://evil.com/bedirhansari42/logisticedo/releases`, `https://user@github.com/bedirhansari42/logisticedo/releases`, `"not a url"`, `""`.
- [ ] **Step 2: Run** `cd desktop && node --test net-policy.test.js` → FAIL.
- [ ] **Step 3: Implement** `net-policy.js`: sabitleri, `isReleaseUrl`'ı ve `isAllowed` sonuna `if (url === updateUrl) return true;` ekle; dosya başındaki açıklama yorumunu "tek istisna: sürüm kontrolü" olarak güncelle.
- [ ] **Step 4: Run** → PASS.

### Task 4: Ana süreç: sürüm kontrolü ve IPC

**Files:**
- Create: `desktop/update-main.js`
- Test: `desktop/update-main.test.js`
- Modify: `desktop/main.js` (register + lockNetwork `updateUrl`), `desktop/preload.js`, `desktop/package.json` (`build.files`'a `"update-main.js"`; `test:net` zaten `*.test.js` çalıştırır)

**Interfaces:**
- Consumes: `UPDATE_API_URL`, `isReleaseUrl` (Task 3).
- Produces:
  - `parseRelease(json: unknown): { tag: string, url: string } | null` — `tag_name` string (1–64 karakter), `draft` ve `prerelease` `true` değil, `html_url` `isReleaseUrl`'dan geçiyor; aksi `null`.
  - `fetchLatest(fetchFn, url: string, timeoutMs = 8000): Promise<{ tag, url }>` — `fetchFn(url, { headers: { Accept: "application/vnd.github+json" }, signal })`; `!res.ok`, JSON hatası, `parseRelease === null` ya da zaman aşımında reddeder.
  - `register({ ipcMain, isTrusted, app, net, shell, updateUrl }): void` — kanallar: `lgx:update:version` → `app.getVersion()`; `lgx:update:check` → `{ current: string, latest: { tag: string, url: string } | null, error: boolean }` (fetch `net.fetch.bind(net)` ile, hata `error:true`); `lgx:update:open` (url) → `isReleaseUrl(url)` ise `shell.openExternal(url)` ve `true`, değilse `false`. Üç kanal da güvenilmeyen gönderende (`!isTrusted(e)`) `{current:"",latest:null,error:true}` / `""` / `false` döner.
  - `preload.js`: `contextBridge.exposeInMainWorld("lgxUpdate", { version(), check(), open(url) })`.

- [ ] **Step 1: Failing tests** (`node:test`, sahte `fetchFn`): `parseRelease`: geçerli kayıt → `{tag:"v1.2.0",url}`; `prerelease:true`, `draft:true`, `tag_name` yok, `tag_name` 65 karakter, `html_url` `https://evil.com/...`, `null`, string → `null`. `fetchLatest`: 200 geçerli → sonuç; 404, 403, `json()` fırlatıyor, `html_url` yabancı → reddedilir; hiç cevap vermeyen fetch (`signal` abort edilince reddeden Promise) `timeoutMs: 20` ile reddedilir. `register` ile sahte `ipcMain` (`handle` kaydeder): `check` başarıda `{current:"1.0.0",latest:{...},error:false}`, fetch hatasında `{current:"1.0.0",latest:null,error:true}` ve fırlatmaz; `open` yabancı adreste `false` ve `shell.openExternal` çağrılmaz, release adresinde çağrılır; `isTrusted` false iken hiçbir kanal fetch yapmaz.
- [ ] **Step 2: Run** `cd desktop && node --test update-main.test.js` → FAIL.
- [ ] **Step 3: Implement** `update-main.js` (CommonJS, `"use strict"`, başlık yorumu `backup-main.js` gibi). `main.js`: `const UPDATE_URL = (!app.isPackaged && process.env.LGX_UPDATE_URL) || UPDATE_API_URL;`, `lockNetwork` içinde `isAllowed(details.url, { scheme: SCHEME, devUrl: DEV_URL, updateUrl: UPDATE_URL })`, `app.whenReady` içinde `require("./update-main.js").register({ ipcMain, app, net, shell, updateUrl: UPDATE_URL, isTrusted: (e) => isTrustedSender(e, { scheme: SCHEME, host: HOST, devUrl: DEV_URL }) })`; `lockNetwork` üstündeki yorumu "uygulama dışına yalnızca sürüm kontrolü için tek GitHub adresi açıktır" olarak düzelt. `preload.js` başındaki açıklamayı güncelle.
- [ ] **Step 4: Run** `node --test update-main.test.js` ve `npm run test:net` → PASS; `node --check main.js && node --check preload.js && node --check update-main.js`.

### Task 5: Arayüz: denetim API'si ve güncelleme penceresi

**Files:**
- Create: `desktop/src/update/api.mjs` (.mjs: `node --test` ile test edilebilsin), `desktop/src/update/api.test.mjs`, `desktop/src/components/UpdateNotice.jsx`
- Modify: `desktop/src/App.jsx` (`<UpdateNotice />` `<BackupReminder />` yanına), `desktop/src/lib/strings.js` (TR+EN)

**Interfaces:**
- Consumes: `isEnabled`, `shouldNotify`, `skipVersion`, `loadSkipped` (Task 2); `normalizeVersion`, `isNewer` (Task 1); `window.lgxUpdate` (Task 4).
- Produces (`api.mjs`):
  - `updateApi(): { version, check, open } | null` (`window.lgxUpdate` ya da `null`)
  - `checkForUpdate({ manual = false } = {}): Promise<{ status: "unavailable" | "off" | "error" | "current" | "newer", current: string, latest?: { version: string, url: string } }>` — köprü yoksa `unavailable`; `!manual && !isEnabled()` ise `off` (köprü çağrılmaz); `error` bayrağı `error`; `isNewer(latest.tag, current)` ise `newer`, değilse `current`.
  - `openRelease(url: string): Promise<boolean>`
  - `useAppVersion(): string` — ilk değer `__APP_VERSION__`, köprü varsa `version()` sonucu ile değişir.
- Metin anahtarları (TR / EN), `EXTRA` içinde `d.bkr.*` yanına: `d.upd.title` ("Yeni sürüm hazır" / "A new version is available"), `d.upd.msg` ("{latest} sürümü yayınlandı. Şu an kullandığınız sürüm: {current}." / "Version {latest} has been released. You are using {current}."), `d.upd.download` ("İndir"/"Download"), `d.upd.later` ("Sonra"/"Later"), `d.upd.skip` ("Bu sürümü atla"/"Skip this version").

- [ ] **Step 1: Strings:** yukarıdaki beş anahtarı iki dile ekle; `node scripts/check-i18n.mjs` → 0 eksik.
- [ ] **Step 2: Failing tests (`api.test.mjs`)**: `globalThis.window` ve `localStorage`'ı sahte kur. Köprü yokken `checkForUpdate()` → `{status:"unavailable"}`. Köprü sahte (`check` çağrı sayar): `setEnabled(false)` iken `checkForUpdate()` → `status:"off"` ve `check` **hiç çağrılmaz**; aynı durumda `checkForUpdate({manual:true})` çağırır. `check` → `{current:"1.0.0",latest:{tag:"v1.1.0",url},error:false}` ⇒ `status:"newer"`, `latest.version==="1.1.0"`; `latest.tag:"v1.0.0"` ⇒ `"current"`; `latest.tag:"v0.9.0"` (geliştirme) ⇒ `"current"`; `latest.tag:"latest"` ⇒ `"current"`; `error:true` ⇒ `"error"`; `check` fırlatırsa `"error"` (kendisi fırlatmaz). `openRelease("https://evil.com/")` köprüye gider ama sonuç yoksa false.
- [ ] **Step 2b: Run** `node --test src/update/api.test.mjs` → FAIL.
- [ ] **Step 2c: Implement `api.mjs`** yukarıdaki imzalarla (saf kararlar Task 1–2'de; burada yalnızca köprü + sonuç eşleme; `useAppVersion` `react`'ten `useState/useEffect`).
- [ ] **Step 3: Implement `UpdateNotice.jsx`** — `BackupReminder.jsx` desenini izler (`<dialog className="dialog dialog--confirm">`, `showModal`, `onCancel` = Sonra). Kontrol `checkForUpdate()`: ilk 3 sn sonra, sonra 24 saatte bir. `status === "newer"` ve `shouldNotify({ latest: latest.version, current, skipped: loadSkipped(), dismissed })` ise `found` durumuna al. Başka `dialog[open]` varken açma; her 60 sn'de yeniden dene. Düğmeler: **İndir** (`openRelease(url)`, pencereyi kapat ve `dismissed`'a ekle), **Sonra** (`dismissed` = bu sürüm; yalnızca oturum, state'te), **Bu sürümü atla** (`skipVersion`). Köprü yoksa (`updateApi()` null, tarayıcıda geliştirme) hiçbir şey çizmez ve zamanlayıcı kurmaz.
- [ ] **Step 4: App.jsx'e `<UpdateNotice />` ekle.**
- [ ] **Step 5: Verify:** `cd desktop && npm run build` başarılı; `npm run test:update` PASS (Task 1–2 ve `api.test.mjs`); (gerçek pencere doğrulaması Task 6'da).

### Task 6: Ayarlar, sürüm numarası, README ve uçtan uca doğrulama

**Files:**
- Modify: `desktop/src/pages/Settings.jsx`, `desktop/src/lib/strings.js`, `README.md`, `desktop/README.md`

**Interfaces:**
- Consumes: `updateApi`, `checkForUpdate`, `openRelease`, `useAppVersion` (Task 5); `isEnabled`, `setEnabled` (Task 2).
- Metin anahtarları (TR / EN): `d.set.updates` ("Güncellemeler"/"Updates"), `d.set.updatesCheck` ("Yeni sürümü denetle"/"Check for new versions"), `d.set.updatesNote` ("Açıkken uygulama GitHub'dan yalnızca en son sürüm numarasını okur; hiçbir veriniz gönderilmez." / "When on, the app only reads the latest version number from GitHub; none of your data is sent."), `d.set.checkNow` ("Şimdi denetle"/"Check now"), `d.set.checking` ("Denetleniyor…"/"Checking…"), `d.set.upToDate` ("Güncelsiniz."/"You are up to date."), `d.set.newVersion` ("Yeni sürüm: {v}"/"New version: {v}"), `d.set.checkFail` ("Denetlenemedi. İnternet bağlantınızı kontrol edin."/"Could not check. Check your internet connection.").

- [ ] **Step 1: Strings** ekle; `node scripts/check-i18n.mjs` → 0 eksik.
- [ ] **Step 2: Settings.jsx:** "Hakkında" kartındaki `{__APP_VERSION__}` yerine `useAppVersion()`. Hakkında kartından önce, yalnızca `updateApi()` varsa, "Güncellemeler" kartı: `className="switch"` anahtarı (`role="switch"`, Ayarlar'daki otomatik yedek anahtarı gibi) `isEnabled`/`setEnabled`'a bağlı; not satırı `d.set.updatesNote`; "Şimdi denetle" düğmesi `checkForUpdate({ manual: true })` çağırır (çalışırken `Spinner` + `d.set.checking`), sonucu satırda gösterir: `current` → upToDate, `newer` → newVersion + "İndir" (`openRelease`), `error` → checkFail.
- [ ] **Step 3: README'ler:** kök `README.md` gizlilik paragrafındaki "tüm ağ isteklerini engeller" cümlesini "yalnızca en son sürüm numarasını okumak için GitHub'a tek bir istek gönderir (Ayarlar'dan kapatılabilir); belgeleriniz ve verileriniz hiçbir yere gönderilmez" olarak değiştir. `desktop/README.md` "Güvenlik ve gizlilik" ilk maddesini aynı şekilde düzelt ve komutlara `npm run test:update` ile "Güncelleme bildirimi" kısa bölümünü (kontrol zamanı, `LGX_UPDATE_URL` yalnızca geliştirmede) ekle.
- [ ] **Step 4: Tüm testler:** `cd desktop && for t in net update planner landed foc proforma backup notes; do npm run test:$t 2>&1 | grep -E "ℹ (pass|fail)"; done` → hepsinde `fail 0`; `node scripts/check-i18n.mjs` → 0 eksik; `npm run build` başarılı.
- [ ] **Step 5: Elle uçtan uca (gerçek Electron, kullanıcının profiline dokunmadan):** scratchpad'de `latest.json` oluştur (`{"tag_name":"v9.9.9","html_url":"https://github.com/bedirhansari42/logisticedo/releases/tag/v9.9.9","draft":false,"prerelease":false}`); `python3 -m http.server 8799` ile sun (8765'e dokunma); `LGX_UPDATE_URL=http://localhost:8799/latest.json npx electron . --user-data-dir=<scratchpad>/profile` ile aç. Beklenen: ~3 sn sonra "Yeni sürüm hazır" penceresi, "9.9.9" ve yüklü sürüm görünür; **İndir** tarayıcıda release sayfasını açar; **Bu sürümü atla** sonrası yeniden açılışta pencere çıkmaz; Ayarlar'da anahtarı kapatıp yeniden açınca otomatik pencere çıkmaz ama "Şimdi denetle" "Yeni sürüm: 9.9.9" der; sunucuyu kapatınca "Şimdi denetle" "Denetlenemedi" der ve açılışta pencere çıkmaz. Ayarlar → Hakkında'daki sürüm `package.json` sürümüyle aynı. Sonra sunucuyu durdur ve scratchpad profilini sil.
