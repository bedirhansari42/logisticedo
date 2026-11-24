# Uygulama içinden güncelleme (tasarım)

Tarih: 2026-11-24 · Durum: onay bekliyor · Önceki iş: `2026-11-24-update-notice-design.md` (yalnızca bildirim)

## Niyet
Yeni sürüm çıkınca kullanıcı uygulamanın içinden "Güncelle" der; paket indirilir, doğrulanır, kurulur, uygulama yeniden açılır. Kullanıcı tarayıcıya ya da GitHub'a gitmez. Kullanıcıların çoğu Windows'ta, Mac de gerekli.

## Hedefler
- Windows (NSIS kurulumlu) ve macOS (universal zip) için tek akış: bul → indir → özet doğrula → kullanıcı onaylayınca kur → yeniden başlat.
- Para ve sertifika gerektirmez (imzasız paketlerle çalışır).
- Ağ kilidi en dar hâliyle kalır; sayfa kodu hiçbir adres veremez.
- Kullanıcı verisi (IndexedDB, localStorage, antetler) güncellemeden etkilenmez.

## Hedef dışı / istenmeyen
- Kod imzalama, Apple notarization, delta/artımlı güncelleme, zorunlu güncelleme, kullanıcı onayı olmadan kurma.
- Windows portable sürümü: kendini güncelleyemez; eski davranış (release sayfasını aç) kalır.
- `electron-updater` kütüphanesi kullanılmaz.

## Kısıtlar
- Paketler imzasız; özet doğrulaması yalnızca bozulmayı yakalar, kaynağı kanıtlamaz. Güven GitHub hesabı + TLS'e dayanır (kullanıcıya söylendi).
- "Dış ağ yok" vaadi: ana süreç dışında hiçbir istek çıkamaz; izinli adresler `net-policy.js` içinde sabit.
- Test için `LGX_UPDATE_URL` yalnızca paketlenmemiş derlemede çalışır (mevcut kural).

## Yaklaşımlar
- **A. electron-updater + Mac için özel yöntem:** Windows hazır, Mac ayrı; iki mekanizma, kütüphane kendi ağ kodunu getirir. Elendi.
- **B. Tek özel mekanizma (seçildi):** mevcut `update-main.js` üstüne; Windows'ta sessiz NSIS kurulumu, Mac'te `.app` değiştirme. Yeni bağımlılık yok, ağ kilidi dar.
- **C. Apple Developer + electron-updater:** Mac'te en sağlam ama yıllık ücret. İleride B'nin üstüne eklenebilir.

## Tasarım (seçilen yol: B)
**Akış.** Mevcut denetim "yeni sürüm var" derse pencere "Güncelle / Sonra / Bu sürümü atla" gösterir. "Güncelle": ana süreç paketi arka planda indirir (ilerleme çubuğu), SHA-256'yı doğrular, sonra "Yeniden başlat ve kur" düğmesi çıkar; kullanıcı ne zaman isterse. Hata olursa mesaj + "Tarayıcıda aç" (eski yol).

**Ana süreç (`update-main.js` genişler, yeni dosya `update-install.js` olabilir).**
- Renderer yalnızca "indir", "kur", "iptal" der; **adres/dosya adı vermez.** Paketi ana süreç, GitHub API'den aldığı release'in asset listesinden kendisi seçer.
- Asset seçimi: Windows → `*-Setup-*-win-x64.exe`; Mac → `*-mac-universal.zip`. Adres tam olarak `https://github.com/<REPO>/releases/download/<tag>/<ad>` kalıbına uymalı; ad sabit desenle eşleşmeli. Gerçek ad kalıpları `desktop/dist` çıktısından doğrulanır.
- Özet: API'deki asset `digest` (`sha256:…`) ile karşılaştırılır; eşleşmezse dosya silinir, kurulum yapılmaz. `digest` yoksa güncelleme reddedilir (sessizce kurmak yok).
- Boyut üst sınırı (ör. 500 MB) ve zaman aşımı; indirme `app.getPath("temp")/logisticedo-update/` içine; açılışta eski kalıntılar silinir.
- **Windows:** kurucu `/S --force-run` ile ayrık süreç olarak başlatılır, uygulama kapanır. Kurulum kullanıcı bazlı (perMachine:false), UAC gerekmez. Portable ise (`PORTABLE_EXECUTABLE_FILE` var) kurulum sunulmaz, release sayfası açılır.
- **Mac:** zip `ditto` ile geçici klasöre açılır; paket kontrol edilir: `.app` içinde beklenen çalıştırılabilir dosya var ve `lipo -archs` çıktısı `x86_64 arm64` (`codesign --verify` KULLANILMAZ: v1.0.2 paketleri bütün-paket mührü taşımıyor, `not signed at all` verir; yalnızca ana ikili linker-signed ad-hoc, M1/M2'de çalışmak için bu yeterli). Ayrık bir kabuk betiği ana sürecin kapanmasını bekler, eski `.app`'i `.app.old` yapar, yenisini yerine koyar, `xattr -dr com.apple.quarantine` uygular, açar; yeni sürüm açılınca `.app.old` silinir. Uygulama yazılamayan bir yerdeyse (DMG'den çalışıyor, App Translocation) kurulum yapılmaz; "Önce Uygulamalar'a taşıyın" mesajı + tarayıcı yolu.
- **Ağ kilidi:** istisna iki yönlü genişler, hâlâ yalnızca GET + yalnızca ana süreç: `github.com/<REPO>/releases/download/…` ve bu adresin yönlendirdiği GitHub dosya sunucusu (ana bilgisayar adı gerçek istekte doğrulanır; yönlendirmeler `onBeforeRequest`'e de düşer).
- IPC: `lgx:update:install` (başlat), `lgx:update:progress` (olay), `lgx:update:apply` (yeniden başlat ve kur), `lgx:update:cancel`. Hepsi `isTrusted` ile korunur. Mevcut `lgx:update:open` kalır.

**Arayüz.** `UpdateNotice.jsx`: "İndir" → "Güncelle" (durumlar: hazır, iniyor %, hazır-yeniden başlat, hata). Ayarlar'daki "Şimdi denetle" aynı akışa bağlanır. Yeni metinler `strings.js`'e TR+EN, `check-i18n.mjs` geçmeli.

**Sürüm hattı.** `release.yml` zaten `.dmg`, `.zip`, `.exe` yüklüyor; ek değişiklik gerekmez (digest'i GitHub kendisi hesaplar). Yalnızca kararlı release (`/releases/latest`) sunulur; `-rc` ön sürümleri uygulamaya gelmez.

## Builder'a bırakılanlar (kendi kararım, işaretli)
- GitHub asset `digest` alanı doğrulandı (v1.0.2'nin 4 dosyasında da `sha256:…` var); `SHA256SUMS.txt` yedeğine gerek yok. Açık kalan: indirme yönlendirmesinin son ana bilgisayar adı gerçek istekte doğrulanır.
- Mac imza durumu doğrulandı (2026-11-24, v1.0.2): ana ikili ad-hoc/linker-signed, universal (`x86_64 arm64`), bütün-paket mührü yok. Kalıcı iyileştirme (benim kararım): derlemeye `codesign --force --deep -s -` adımı (afterSign/afterPack) eklenir; yeni sürümde Mac'te çalıştığı doğrulanır. Eksikliği güncellemeyi engellemez.
- Boyut sınırı, zaman aşımı, ilerleme güncelleme sıklığı: makul değerler.
- Test: saf mantık (asset seçimi, URL doğrulama, digest, durum makinesi) `node --test` ile; sahte `latest.json`/dosya sunucusu (8799) + `LGX_UPDATE_URL` ile uçtan uca; Mac'te gerçek `.app` değiştirme bu makinede denenir; **Windows kurulumu bu makinede denenemez**, kullanıcı gerçek bir Windows'ta kararlı bir release ile (ya da `LGX_UPDATE_URL` ile) denemeli.
