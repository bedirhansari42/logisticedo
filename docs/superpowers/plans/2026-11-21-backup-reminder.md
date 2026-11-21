# Yedek hatırlatma penceresi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Son yedek 24 saatten eskiyse, hangi sayfada olursa olsun "Şimdi yedekle / Sonra hatırlat" pop up'ı göstermek.

**Architecture:** Karar mantığı saf bir modülde (`reminder.mjs`, testli); `BackupReminder.jsx` bunu `lastAt` (mevcut `auto.mjs` deposu) ve `useApp()` verisiyle besleyip `.dialog` görünümünde çizer. Elle yedek mantığı Settings'ten ortak bir modüle (`manual.js`) çıkarılır.

**Tech Stack:** React 18 (Vite), `node:test`, localStorage, Electron köprüsü `window.lgxBackup`.

**Spec:** `docs/superpowers/specs/2026-11-21-backup-reminder-design.md`

## Global Constraints

- Eşik: son yedek **24 saat** (`24 * 3600 * 1000` ms) ya da daha eski → hatırlat (sınır dahil).
- Erteleme: **1 saat**, localStorage anahtarı `lgx.backupRemind`, bilgisayara özgü.
- Boş kurulumda (sevkiyat, proforma, antet yok) hiç çıkmaz.
- Yeni UI metinleri `src/lib/strings.js` içinde TR **ve** EN, anahtar öneki `d.bkr.`; `node scripts/check-i18n.mjs` geçmeli.
- Yeni tema/dış bağımlılık yok; mevcut `.dialog`, `.btn`, `toast` kullanılır.
- Kullanıcı git'i elle yönetiyor: **commit adımı yok**, commit atma.
- Tüm komutlar `desktop/` klasöründen çalışır.

## Review Focus

- `lastAt` gelecekte (saat geri alınmış, 5 dakikadan fazla) → geçersiz sayılıp hatırlatır (aksi halde süresiz susar). → Task 1 testi.
- `lgx.backupRemind` bozuk/sayı değil → erteleme yok sayılır. → Task 1 testi.
- Erteleme süresi 1 saatten uzaksa (saat oynanmış) → yok sayılır. → Task 1 testi.
- Kullanıcı başka bir modal açıkken (ör. onay penceresi) hatırlatma üstüne binmez, sonraki kontrole kalır. → Task 3 (`dialog[open]` kontrolü).
- Pencere açıkken otomatik yedek biter (`lastAt` yenilenir) → pencere kendiliğinden kapanır. → Task 3 (açık durumu `needsReminder`'dan türetilir).

---

### Task 1: Karar mantığı `reminder.mjs`

**Files:**
- Create: `src/backup/reminder.mjs`
- Test: `src/backup/reminder.test.mjs`

**Interfaces:**
- Produces:
  - `REMIND_AFTER_MS = 86400000`, `SNOOZE_MS = 3600000`, `REMIND_KEY = "lgx.backupRemind"`
  - `needsReminder({ lastAt, snoozedUntil, hasData, now }: {lastAt:number, snoozedUntil:number, hasData:boolean, now:number}): boolean`
  - `loadSnooze(): number` (yoksa/bozuksa `0`), `snooze(now = Date.now()): number` (`now + SNOOZE_MS` yazar ve döner), `clearSnooze(): void`
  - `ago(lastAt: number, now: number): { unit: "h" | "d", n: number }` — 48 saatten azsa saat (`floor`), değilse gün (`floor`)

- [ ] **Step 1: Write the failing tests** in `src/backup/reminder.test.mjs` (localStorage taklidi `auto.test.mjs`'deki gibi `globalThis.localStorage` ile kurulur; modül dinamik `await import` edilir). Testler:
  - `needsReminder`: `hasData:false` → `false`; `lastAt: 0` + veri var → `true`; `now - lastAt = 24h - 1ms` → `false`; tam `24h` → `true`; `snoozedUntil = now + 30dk` → `false`; `snoozedUntil = now - 1` → `true`.
  - Saat oynanmış: `lastAt = now + 10 dk` → `true`; `lastAt = now + 2 dk` (5 dk toleransı içinde) → `false`; `snoozedUntil = now + 5 saat` (> `SNOOZE_MS`) → yok sayılır, `true`.
  - `loadSnooze` boş depoda `0`; depoya `"abc"`, `"-5"`, `"NaN"` yazılınca `0`; `snooze(1000)` → `1000 + SNOOZE_MS` döner ve `loadSnooze()` aynısını verir; `clearSnooze()` sonrası `0`.
  - `ago`: 25 saat → `{unit:"h", n:25}`; 47.9 saat → `{unit:"h", n:47}`; 72 saat → `{unit:"d", n:3}`.

- [ ] **Step 2: Run to verify fail**

Run: `node --test src/backup/reminder.test.mjs`
Expected: FAIL (`Cannot find module './reminder.mjs'`)

- [ ] **Step 3: Implement `src/backup/reminder.mjs`** (imzalar yukarıda). `needsReminder` sırası: `!hasData` → `false`; erteleme geçerliyse (`snoozedUntil > now && snoozedUntil - now <= SNOOZE_MS`) → `false`; `lastAt > now + 5 dk` → `true`; `lastAt <= 0` → `true`; aksi halde `now - lastAt >= REMIND_AFTER_MS`. Depo erişimi `globalThis.localStorage` ile, her okuma/yazma `try/catch` içinde (`auto.mjs` deseni); `loadSnooze` yalnızca sonlu ve `> 0` sayıyı kabul eder.

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:backup`
Expected: tüm backup testleri PASS (mevcutlar + yeni).

---

### Task 2: Elle yedeği ortak modüle çıkar

**Files:**
- Create: `src/backup/manual.js`
- Modify: `src/pages/Settings.jsx` (`doExport`, satır ~34-52)

**Interfaces:**
- Consumes: `exportBackup()` (`io.js`), `getAuto/saveAuto` (`auto.mjs`), `saveBlob` (`lib/download.js`), `toast` (`@common`).
- Produces: `runManualBackup(t: (key, vars?) => string): Promise<"saved" | "cancelled">` — hata olursa **fırlatır** (çağıran toast gösterir). Davranış bugünkü `doExport` ile birebir aynı: masaüstünde `window.lgxBackup.saveAs(json, name, getAuto().dir)`, `null` dönerse `"cancelled"`; başarıda `saveAuto({ dir: r.dir, lastAt: now, lastTry: now, lastError: "", lastFile: r.path })` ve `d.bk.savedTo` toast'ı; tarayıcıda `saveBlob` + `d.bk.exported` toast'ı. Dosya adı `logisticedo-yedek-YYYY-MM-DD.json`.

- [ ] **Step 1: Create `src/backup/manual.js`** — `doExport` içindeki `try` gövdesini (busy ve hata toast'ı hariç) bu fonksiyona taşı.

- [ ] **Step 2: Update `Settings.jsx`** — `doExport` yalnızca `setBusy("export")`, `await runManualBackup(t)`, mevcut `catch` (hata toast'ı) ve `finally` içerir; kullanılmayan içe aktarmalar (`saveBlob`, `exportBackup` başka yerde kullanılmıyorsa) temizlenir.

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: derleme hatasız biter. Ardından uygulamayı çalıştırıp Ayarlar → "Yedek al" ile bir yedek kaydet; "Son yedek" satırı güncellenmeli (davranış değişmedi).

---

### Task 3: Pencere, bağlama ve metinler

**Files:**
- Create: `src/components/BackupReminder.jsx`
- Modify: `src/App.jsx` (`<ConfirmHost />` yanına `<BackupReminder />`; `AppProvider` içinde olmalı, `useApp()` kullanır)
- Modify: `src/lib/strings.js` (TR: `d.bk.err.storage` satırından sonra ~177; EN: ~664)
- Modify: `src/styles/dash.css` (yalnızca gerekirse; `.dialog--confirm` yeniden kullanılır)

**Interfaces:**
- Consumes: `needsReminder`, `loadSnooze`, `snooze`, `clearSnooze`, `ago` (Task 1); `runManualBackup` (Task 2); `getAuto`, `subscribe` (`auto.mjs`); `useApp()` → `shipments`, `proformas`, `letterheads`; `toast`.
- Produces: `export function BackupReminder(): JSX.Element | null`.

**Metinler** (TR / EN, anahtarlar `d.bkr.*`):
- `title`: "Yedek zamanı" / "Time to back up"
- `msg`: "Verileriniz yalnızca bu bilgisayarda duruyor. Bir arıza olursa yedeksiz geri getirilemez." / "Your data only lives on this computer. If something fails, it can't be recovered without a backup."
- `never`: "Hiç yedek alınmadı." / "No backup has been made yet."
- `last`: "Son yedek: {ago}" / "Last backup: {ago}"
- `agoH`: "{n} saat önce" / "{n} hours ago"; `agoD`: "{n} gün önce" / "{n} days ago"
- `now`: "Şimdi yedekle" / "Back up now"; `later`: "Sonra hatırlat" / "Remind me later"; `busy`: "Hazırlanıyor…" / "Preparing…"

- [ ] **Step 1: Add the strings** (TR ve EN, yukarıdaki on anahtar).

- [ ] **Step 2: Implement `BackupReminder`**
  - `auto = useSyncExternalStore(subscribe, getAuto)`; `hasData = shipments.length + proformas.length + letterheads.length > 0`.
  - `shown` state (kontrol tetikler), `busy` state. **Görünürlük** `shown && needsReminder({ lastAt: auto.lastAt, snoozedUntil: loadSnooze(), hasData, now: Date.now() })` olarak türetilir; böylece yedek alınınca (otomatik dahil) pencere kendiliğinden kapanır.
  - `useEffect`: 3 sn sonra ve sonra her 60 sn `check()`; `check`, `needsReminder` doğruysa ve `document.querySelector("dialog[open]")` yoksa `setShown(true)`. Temizlikte zamanlayıcıları sil.
  - Çizim `ConfirmHost.jsx` ile aynı iskelet (`dialog.dialog.dialog--confirm`, `showModal()` açılışta, `onCancel` = "Sonra hatırlat"). Gövde: `msg` + `lastAt > 0` ise `last` (`ago` ile), değilse `never`.
  - **Şimdi yedekle:** `busy`; `runManualBackup(t)` → `"saved"` ise `clearSnooze(); setShown(false)`; `"cancelled"` ise açık kalır; hata → `toast(t("d.bk.err.fail", { msg }), "error", 8000)`; `finally` busy söner.
  - **Sonra hatırlat:** `snooze(); setShown(false)`.

- [ ] **Step 3: Mount in `App.jsx`** — `<ConfirmHost />` satırından sonra `<BackupReminder />`.

- [ ] **Step 4: Verify i18n and build**

Run: `node scripts/check-i18n.mjs && npm run build && npm run test:backup`
Expected: i18n denetimi temiz, derleme başarılı, testler PASS.

- [ ] **Step 5: Verify in the running app** (uygulamayı kullanıcının bildiği biçimde aç, DevTools konsolunda):
  1. `localStorage.setItem("lgx.autobackup", JSON.stringify({ enabled:false, hours:6, dir:"", lastAt: Date.now() - 30*3600e3, lastTry:0, lastError:"", lastFile:"" }))` → sayfayı yenile, ~3 sn sonra pencere "Son yedek: 30 saat önce" ile çıkmalı (kayıtlı veri varsa).
  2. "Sonra hatırlat" → kapanır; yenileyince 1 saat çıkmaz.
  3. `localStorage.removeItem("lgx.backupRemind")`, yenile → çıkar; "Şimdi yedekle" → kayıt penceresi, kaydedince kapanır ve `lastAt` yenilenir.
  4. Başka bir sayfada (ör. Sevkiyatlar, bir editör) aynı şekilde çıktığını doğrula.

---

## Self-review

- **Spec kapsamı:** tetik/24 saat/otomatik-elle fark etmez (T1, `lastAt` ortak), hasData (T1+T3), zamanlama açılış+dakikada bir (T3), pencere içeriği ve iki düğme (T3), erteleme 1 saat/kalıcı/yedekte silinir (T1+T3), hata davranışı (T3), TR/EN + check-i18n (T3), testler (T1). Eksik yok.
- **Tip tutarlılığı:** `needsReminder`/`snooze`/`loadSnooze`/`clearSnooze`/`ago`/`runManualBackup` adları T1-T3'te aynı.
- **Oran:** plan, tasarımdan kısa tutuldu; gövdeler yazılmadı, imza + test + değerler verildi.
