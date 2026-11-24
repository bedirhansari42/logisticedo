# Uygulama içinden güncelleme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kullanıcı "Güncelle" deyince yeni sürüm paketi uygulama içinden indirilsin, SHA-256 ile doğrulansın, onayla kurulsun ve uygulama yeniden açılsın (Windows NSIS + macOS universal zip).

**Architecture:** Mevcut `update-main.js` (ana süreç, IPC `lgxUpdate`) genişler; saf mantık üç yeni CommonJS dosyaya ayrılır (`update-assets.js` seçim/doğrulama, `update-download.js` indirme+özet, `update-apply.js` kurulum). Renderer adres vermez, yalnızca başlat/uygula/iptal der. Ağ kilidi yalnızca GitHub indirme adreslerine, yalnızca ana süreçten GET ile açılır.

**Tech Stack:** Electron ana süreç (`net.fetch`, `child_process.spawn`), Node `crypto`/`fs`, React 19, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-24-in-app-update-design.md`

## Global Constraints

- Repo: `bedirhansari42/logisticedo`. İndirme adresi tam olarak `https://github.com/bedirhansari42/logisticedo/releases/download/<tag>/<ad>`; yönlendirme ana bilgisayarları yalnızca `release-assets.githubusercontent.com` ve `objects.githubusercontent.com` (yalnızca https, GET, `fromRenderer === false`).
- Paket seçimi: Windows `^logisticedo-Setup-.+-win-x64\.exe$`; Mac `^logisticedo-.+-mac-universal\.zip$`. Portable (`PORTABLE_EXECUTABLE_FILE` ortam değişkeni var) kurulum sunulmaz.
- Özet zorunlu: asset `digest` = `sha256:<64 hex>`; yoksa ya da eşleşmezse dosya silinir, kurulum yapılmaz.
- Boyut üst sınırı 600 MB; indirme klasörü `<temp>/logisticedo-update/`; açılışta kalıntılar silinir.
- Windows kurucusu: `/S --force-run`, ayrık (detached) süreç, sonra `app.quit()`. Mac: zip `ditto` ile açılır, `.app` kontrolü = beklenen çalıştırılabilir dosya var + `lipo -archs` çıktısında `x86_64` ve `arm64` (`codesign --verify` KULLANILMAZ), ayrık kabuk betiği ana sürecin çıkmasını bekler, eski `.app` → `.app.old`, yeni yerine, `xattr -dr com.apple.quarantine`, `open`; yeni sürüm açılınca `.app.old` silinir.
- Kurulum yalnızca kullanıcı "Yeniden başlat ve kur"a basınca; otomatik kurulum yok. Yalnızca kararlı release (mevcut `parseRelease` kuralı).
- Hata nedenleri (arayüz yalnızca bu etiketleri görür): `no_asset | digest | size | network | disk | portable | not_writable | aborted | unknown`.
- Yeni ana süreç dosyaları `desktop/package.json` `build.files` listesine eklenir (yoksa paketli uygulama açılmaz).
- Metinler TR+EN; `node scripts/check-i18n.mjs` 0 eksik. `LGX_UPDATE_URL` yalnızca `!app.isPackaged`.
- Git'i kullanıcı elle yönetir: commit atma, gönderme.

## Review Focus

- İndirme yarıda kesilir, disk dolar, kullanıcı iptal eder: kısmi dosya silinir, durum `idle`/`error`, yeniden denenebilir. (Task 3)
- Özet eşleşmez ya da release'te `digest` yok: kurulum yapılmaz, dosya silinir. (Task 2, 3)
- Release'te bu platformun paketi yok (ör. `.exe` yüklenmemiş): `no_asset`, "Tarayıcıda aç" yolu. (Task 2, 5)
- Renderer `apply`'ı hazır olmadan çağırır ya da adres göndermeye çalışır: yok sayılır. (Task 5)
- Mac'te uygulama DMG'den / `/Volumes` / App Translocation altında ya da yazılamayan klasörde: hiçbir şey değiştirilmez, `not_writable`. (Task 4)
- Windows portable: kurulum düğmesi yerine eski "tarayıcıda aç". (Task 4, 6)

---

### Task 1: Ağ kilidi — indirme adresleri

**Files:**
- Modify: `desktop/net-policy.js` (`isAllowed`, exports)
- Modify: `desktop/main.js:57-61` (`lockNetwork` seçeneği geçirir), `main.js:16` civarı (`DOWNLOAD_PREFIX` test geçersiz kılması)
- Test: `desktop/net-policy.test.js`

**Interfaces:**
- Produces: `DOWNLOAD_PREFIX: string` (`https://github.com/bedirhansari42/logisticedo/releases/download/`), `ASSET_HOSTS: string[]`; `isAllowed(url, { …mevcutlar, downloadPrefix = DOWNLOAD_PREFIX })`.

- [ ] **Step 1: Failing testler yaz.** `isAllowed` şunları true döner: `DOWNLOAD_PREFIX + "v1.1.0/logisticedo-Setup-1.1.0-win-x64.exe"` ve `https://release-assets.githubusercontent.com/x?y=1`, `https://objects.githubusercontent.com/x`; hepsi yalnızca `method:"GET", fromRenderer:false` iken. Şunlar false: aynı adresler `fromRenderer:true` ya da `POST` ile; `http://` sürümleri; `https://github.com/baska/repo/releases/download/v1/a.exe`; `https://release-assets.githubusercontent.com.evil.com/x`; `downloadPrefix` verilince (test sunucusu) yalnızca o önek.
- [ ] **Step 2:** `cd desktop && node --test net-policy.test.js` → yeni testler FAIL.
- [ ] **Step 3:** `isAllowed` sonuna iki koşul ekle (mevcut güncelleme adresi koşulunu bozma). Ana bilgisayar karşılaştırması ayrıştırılmış `URL.host` ile tam eşleşme. `main.js`: `downloadPrefix` olarak, `!app.isPackaged && process.env.LGX_UPDATE_URL` varsa o adresin origin'i + `/dl/`, yoksa varsayılan.
- [ ] **Step 4:** `node --test net-policy.test.js` → PASS (eski testler dahil).

### Task 2: Paket seçimi ve doğrulama (`update-assets.js`)

**Files:**
- Create: `desktop/update-assets.js`
- Test: `desktop/update-assets.test.js`

**Interfaces:**
- Consumes: `REPO`, `DOWNLOAD_PREFIX` (net-policy.js).
- Produces:
  - `type Asset = { name: string, size: number, url: string, digest: string }`
  - `parseAssets(json: unknown) -> Asset[]` (GitHub release JSON'unun `assets[]` alanından `name`, `size`, `browser_download_url→url`, `digest`; bozuk girdi atlanır, asla fırlatmaz)
  - `pickAsset(assets: Asset[], platform: string) -> Asset | null` (`"win32"|"darwin"`, bilinmeyen platform null)
  - `validateAsset(asset: Asset, { tag: string, downloadPrefix?: string }) -> boolean`
  - `MAX_BYTES = 600 * 1024 * 1024`

- [ ] **Step 1: Failing testler.** `pickAsset` v1.0.2'nin gerçek dört dosya adıyla: win32 → `logisticedo-Setup-1.0.2-win-x64.exe` (Portable'ı seçmez), darwin → `logisticedo-1.0.2-mac-universal.zip` (dmg'yi seçmez), `linux` → null, yoksa null. `validateAsset` false: `url` etiket/ad ile `prefix+tag+"/"+name` olmayan, `digest` `sha256:` + 64 hex olmayan ya da büyük harf/kısa, `size` 0, negatif ya da > `MAX_BYTES`. `parseAssets(null)`, `{assets:"x"}`, `assets` içinde `null` öğesi → `[]`/atlanır.
- [ ] **Step 2:** `node --test update-assets.test.js` → FAIL.
- [ ] **Step 3:** Uygula (imzalar yukarıda). Digest karşılaştırması küçük harf hex.
- [ ] **Step 4:** PASS.

### Task 3: İndirme + özet (`update-download.js`)

**Files:**
- Create: `desktop/update-download.js`
- Test: `desktop/update-download.test.js` (sahte `fetchFn` + gerçek geçici klasör)

**Interfaces:**
- Consumes: `Asset` (Task 2).
- Produces:
  - `downloadAsset({ fetchFn, asset, destDir, onProgress, signal }) -> Promise<string>` — `fetchFn(url, { signal })` standart `Response` döner; dosyayı `destDir/<asset.name>` yolunda yazar, SHA-256'yı akış boyunca hesaplar, bitince `asset.digest` ile karşılaştırır; `onProgress(received: number, total: number)`.
  - Hatalar `Object.assign(new Error(..), { reason })`: `network` (fetch/okuma hatası, `!res.ok`), `size` (gelen bayt `asset.size`'ı aşar ya da farklıdır), `digest`, `disk` (yazma hatası), `aborted` (`signal`). Her hatada kısmi/yanlış dosya silinir.
  - `cleanupDir(dir: string) -> void` (yoksa sessiz; asla fırlatmaz)

- [ ] **Step 1: Failing testler:** doğru içerik + doğru digest → dosya var, yol döner, `onProgress` son çağrı `(size,size)`; bir bayt farklı içerik → `reason:"digest"` ve dosya yok; akış yarıda hata verir → `network`, dosya yok; `asset.size`'dan fazla bayt → `size`, dosya yok; `AbortController` iptal → `aborted`, dosya yok; HTTP 404 → `network`; `cleanupDir` olmayan klasörde fırlatmaz.
- [ ] **Step 2:** `node --test update-download.test.js` → FAIL.
- [ ] **Step 3:** `response.body` akışını okuyup `fs.createWriteStream`'e yaz (geri basınca saygılı), `crypto.createHash("sha256")` besle. Başlamadan `destDir` oluştur (`recursive`).
- [ ] **Step 4:** PASS.

### Task 4: Kurulum (`update-apply.js`)

**Files:**
- Create: `desktop/update-apply.js`
- Test: `desktop/update-apply.test.js`

**Interfaces:**
- Produces:
  - `isPortable(env: object) -> boolean`
  - `WIN_ARGS = ["/S", "--force-run"]`
  - `locateMacApp(execPath: string) -> string | null` (`…/X.app/Contents/MacOS/Y` → `…/X.app`; `.app` yoksa null)
  - `macTargetStatus(appPath: string, { fsApi }) -> "ok" | "translocated" | "dmg" | "readonly"` (`/AppTranslocation/` içeriyorsa `translocated`; `/Volumes/` ile başlıyorsa `dmg`; üst klasöre yazılamıyorsa `readonly`)
  - `buildMacSwapScript({ pid: number, target: string, source: string, backup: string, openCmd?: string }) -> string` (`/bin/sh` betiği; `kill -0 pid` ile çıkışı bekler; hedefi `backup`'a taşır, `source`'u `ditto` ile hedefe koyar, hata olursa yedeği geri taşır; `xattr -dr com.apple.quarantine`; `openCmd` (varsayılan `open`) hedefi açar)
  - `applyUpdate({ platform, file, execPath, pid, env, spawn, run, tmpDir }) -> Promise<{ ok: true } | { ok: false, reason: "portable" | "not_writable" | "unknown" }>` — win32: portable ise `portable`; yoksa `spawn(file, WIN_ARGS, { detached: true, stdio: "ignore" }).unref()`. darwin: `locateMacApp` + `macTargetStatus` ≠ ok → `not_writable`; `run("ditto", ["-x","-k",file,tmpDir/extract])`; çıkan `.app` içinde `Contents/MacOS/<çalıştırılabilir>` var ve `lipo -archs` hem `x86_64` hem `arm64` içeriyor mu kontrol; sonra betiği dosyaya yazıp `spawn("/bin/sh",[script],{detached:true,stdio:"ignore"}).unref()`. Çağıran `app.quit()` yapar.
  - `finishMacUpdate(execPath, { fsApi }) -> void` (açılışta: `<hedef>.app.old` varsa siler; asla fırlatmaz)

- [ ] **Step 1: Failing testler:** `locateMacApp` iki örnek yol + `.app`'siz yol; `macTargetStatus` için `/private/var/folders/x/AppTranslocation/y/d/X.app`, `/Volumes/logisticedo/X.app`, yazılamayan sahte `fsApi`, normal `/Applications/X.app`; `applyUpdate` win32: `spawn` bir kez `(file, ["/S","--force-run"], {detached:true,…})` ile çağrılır, portable ortamda çağrılmaz ve `portable` döner; darwin `not_writable` iken `run`/`spawn` hiç çağrılmaz; `buildMacSwapScript` çıktısı `kill -0 <pid>`, `.old`/backup taşıma, `ditto`, `xattr -dr com.apple.quarantine` ve geri alma dalını içerir, boşluklu yolları tırnaklar (`'…'`, içindeki `'` kaçışlı).
- [ ] **Step 2:** `node --test update-apply.test.js` → FAIL.
- [ ] **Step 3:** Uygula. `run` enjekte edilebilir (`execFile` sarmalayıcı) ki test gerçek `ditto` çalıştırmasın.
- [ ] **Step 4:** PASS.

### Task 5: Ana süreç kurulum akışı + köprü

**Files:**
- Modify: `desktop/update-main.js` (`register` genişler), `desktop/main.js` (bağlama, açılışta `cleanupDir` + `finishMacUpdate`, `app.quit` geçirme), `desktop/preload.js:12-16`, `desktop/package.json` (`build.files`: `update-assets.js`, `update-download.js`, `update-apply.js`)
- Test: `desktop/update-main.test.js` (mevcut dosyaya ekle)

**Interfaces:**
- Consumes: Task 2-4 işlevleri.
- Produces (IPC): `lgx:update:install` → `{ ok: true } | { ok: false, reason }`; olay `lgx:update:progress` → `{ state: "idle"|"downloading"|"ready"|"error", percent?: number, reason?: string }` (gönderen pencereye); `lgx:update:apply` → `{ ok: boolean, reason?: string }`; `lgx:update:cancel` → `true`. Hepsi `isTrusted(e)` ister; parametre almaz (adres/dosya adı renderer'dan gelmez).
- Produces (preload `window.lgxUpdate`): `install()`, `apply()`, `cancel()`, `onProgress(cb) -> unsubscribe`.

- [ ] **Step 1: Failing testler** (sahte `ipcMain`, `net.fetch`, `app`, `spawn`): `install` önce `updateUrl`'den release'i okur, `parseAssets`+`pickAsset`+`validateAsset` ile seçer; platform paketi yoksa `{ok:false,reason:"no_asset"}`; güvenilmeyen gönderen → reddedilir ve hiçbir fetch yapılmaz; başarılı indirme sonunda son olay `ready`; `apply` hazır değilken `{ok:false}` döner ve `spawn` çağrılmaz; `ready` iken `apply` `applyUpdate`'i çağırır ve başarıdaysa `app.quit()`; ikinci `install` sürerken ilkini yeniden başlatmaz; `cancel` indirmeyi `aborted` ile durdurur ve durum `idle` olur.
- [ ] **Step 2:** `node --test update-main.test.js` → FAIL.
- [ ] **Step 3:** Basit durum makinesi modül içinde (`idle → downloading → ready | error`). Her `install` yeni `AbortController`; ilerleme olayları en çok ~10/sn. `main.js`: `whenReady`'de `cleanupDir(<temp>/logisticedo-update)` ve (darwin) `finishMacUpdate(process.execPath)`; `app.quit` ve `child_process.spawn`, `net.fetch`, `process.platform`, `process.env`, `process.pid` `register`a geçirilir. `build.files`'a üç dosyayı ekle.
- [ ] **Step 4:** `npm run test:net` → tümü PASS.

### Task 6: Arayüz

**Files:**
- Create: `desktop/src/update/install.mjs`, `desktop/src/update/install.test.mjs`
- Modify: `desktop/src/update/api.mjs`, `desktop/src/components/UpdateNotice.jsx`, `desktop/src/pages/Settings.jsx` (yeni sürüm satırında "Güncelle"), `desktop/src/lib/strings.js` (TR+EN), mevcut `api.test.mjs`

**Interfaces:**
- Produces (`install.mjs`): `initialInstall = { phase: "offer", percent: 0, reason: "" }`; `nextInstall(state, event) -> state` — olaylar `{type:"start"}`, `{type:"progress", state, percent, reason}` (köprüden), `{type:"reset"}`; `phase`: `offer | downloading | ready | error`. `canInstall({ portable?: boolean, hasBridge: boolean }) -> boolean`.
- Produces (`api.mjs`): `startInstall() -> Promise<{ok,reason?}>`, `applyInstall() -> Promise<{ok,reason?}>`, `cancelInstall() -> Promise<boolean>`, `onInstallProgress(cb) -> () => void` (köprü yoksa no-op; asla fırlatmaz).
- Metin anahtarları: `d.upd.install` (Güncelle / Update), `d.upd.downloading` (`{pct}`), `d.upd.restart` (Yeniden başlat ve kur / Restart and install), `d.upd.openBrowser` (Tarayıcıda aç / Open in browser), `d.upd.cancel`, `d.upd.err.<reason>` (her neden için bir tane: no_asset, digest, size, network, disk, portable, not_writable, aborted, unknown; `not_writable` metni "Uygulamayı Uygulamalar klasörüne taşıyıp yeniden deneyin" der).

- [ ] **Step 1: Failing testler:** `nextInstall` — start→downloading, progress ready→ready, progress error→error + reason, reset→offer; `canInstall({hasBridge:false})` false; `api.mjs`: köprü yokken üç çağrı da `{ok:false,reason:"unknown"}`/false döner ve fırlatmaz; `onInstallProgress` köprü yokken fonksiyon döner.
- [ ] **Step 2:** `npm run test:update` → FAIL.
- [ ] **Step 3:** Uygula. `UpdateNotice.jsx`: pencerede "İndir" yerine "Güncelle" (portable ya da köprüde `install` yoksa eski "Tarayıcıda aç"); `downloading`'de ilerleme çubuğu + "İptal"; `ready`'de "Yeniden başlat ve kur"; `error`'da neden metni + "Tarayıcıda aç". Pencere indirme sürerken Escape ile kapanırsa indirme arka planda sürer, tekrar açılınca durum görünür (durum modül düzeyinde). Settings'te yeni sürüm bulunduğunda "Güncelle" düğmesi aynı pencereyi açar (`window.dispatchEvent(new CustomEvent("lgx:update:show"))`, `UpdateNotice` dinler).
- [ ] **Step 4:** `npm run test:update && node scripts/check-i18n.mjs` → PASS, 0 eksik.

### Task 7: Mac için ad-hoc mühür (derleme)

**Files:**
- Create: `desktop/scripts/adhoc-sign.cjs`
- Modify: `desktop/package.json` (`build.afterSign`)

**Interfaces:**
- Produces: electron-builder `afterSign(context)` kancası: yalnızca `context.electronPlatformName === "darwin"` iken `codesign --force --deep --sign - <appOutDir>/<productFilename>.app`.

- [ ] **Step 1:** Betiği ve `build.afterSign` ayarını ekle.
- [ ] **Step 2:** Yerelde `cd desktop && npm run dist:mac` çalıştır (zaman alır; `CSC_IDENTITY_AUTO_DISCOVERY=false`).
- [ ] **Step 3:** `codesign --verify --deep --strict dist/mac-universal/logisticedo.app && echo OK` → `OK`. Kanca universal derlemede tetiklenmiyorsa (çıktıda `not signed at all`) kancayı `afterPack`'e taşı ve yeniden dene; ikisi de olmazsa sonucu kullanıcıya bildir (güncellemeyi engellemez, kalıcı iyileştirme).

### Task 8: Uçtan uca doğrulama

**Files:**
- Test araçları oturum scratchpad'inde (kalıcı değil): sahte release sunucusu (port 8799; `/releases/latest` JSON'u + `/dl/<tag>/<ad>` dosyası, `digest` doğru hesaplı), CDP betiği.

- [ ] **Step 1: Mac gerçek `.app` değiştirme.** Task 7'de üretilen `.app`'in kopyasını scratchpad'e koy; sürümünü `package.json` ile bir önceki yapılmış paket gibi ayarla ya da bir "eski" `.app` olarak çalıştır; sahte sunucuyla `LGX_UPDATE_URL=http://localhost:8799/releases/latest` (yalnızca paketlenmemiş derlemede çalışır, bu yüzden `npm run electron` ile; Mac değiştirme betiği için `applyUpdate`'i sahte `.app` klasörleriyle scratchpad'de çalıştır) ve `--user-data-dir=<scratchpad>`. Beklenen: indirme %100, "Yeniden başlat ve kur", ardından `.app.old` oluşur ve yeni açılışta silinir; yanlış digest'li sunucuda kurulum hiç başlamaz.
- [ ] **Step 2: Hata yolları (CDP).** Yanlış digest, yarıda kesilen yanıt, 404, platform paketi eksik: her biri pencerede ilgili hata metnini ve "Tarayıcıda aç"ı gösterir; `~/Library/Application Support/logisticedo` dokunulmaz (test sonrası kontrol et).
- [ ] **Step 3:** Tüm testler: `cd desktop && npm run test:net && npm run test:update && node scripts/check-i18n.mjs`; hepsi PASS.
- [ ] **Step 4: Kullanıcıya teslim notu yaz:** (a) Windows kurulumu bu makinede denenemedi, gerçek Windows'ta ilk kararlı release ile denenmeli; (b) v1.0.2 kullanıcıları bu özelliğe sahip değil, ilk kendi kendine güncelleme yeni sürümden bir sonrakine olur; (c) `-rc` ön sürümleri uygulamaya gelmez.
