# Güncelleme bildirimi (tasarım)

Tarih: 2026-11-24. Kapsam: küçük özellik (masaüstü uygulaması).

## Amaç ve neden

Uygulama GitHub'da ücretsiz dağıtılıyor. Yeni bir release (`v*` etiketi) çıktığında kullanıcı bunu uygulamayı açınca öğrensin ve paketi elle indirsin. Paketler imzasız olduğu için otomatik güncelleme yok; bildirim yalnızca bilgi verir ve release sayfasını açar.

## Hedefler

- Uygulama açılışında (ve açık kaldığı sürece 24 saatte bir) en son kararlı release kontrol edilir.
- Yeni sürüm varsa yedek hatırlatıcıya benzer bir pencere çıkar.
- Ayarlar'daki sürüm numarası, yüklü olan uygulamanın gerçek sürümünü gösterir.

## Hedef dışı / istenmeyen

- Otomatik indirme ya da kurma yok.
- Kapalı uygulamaya bildirim yok (sunucu ya da arka plan servisi yok).
- Ön sürümler (`-rc`, `-beta`, `-alpha`) bildirilmez.
- Kullanıcıdan hiçbir veri gönderilmez; istek yalnızca sürüm bilgisini okur.
- Arayüz (renderer) dış adrese erişemez.

## Yaklaşımlar

1. **Ana süreçte kontrol (seçildi).** Ağ kilidine tek adres açılır: `https://api.github.com/repos/bedirhansari42/logisticedo/releases/latest`. Arayüz yalnızca IPC ile sonucu alır.
2. Arayüzden `fetch`. Kilidi sayfa koduna açar; reddedildi.
3. GitHub Pages'te `latest.json`. Her sürümde elle ek iş; reddedildi.

## Tasarım

- **Ana süreç** (`update-main.js`): IPC `lgx:update:check` ve `lgx:update:open`. GitHub'dan `tag_name`, `html_url`, `body`, `prerelease` okur; sürümü `app.getVersion()` ile karşılaştırır. Ağ hatası, süre aşımı (8 sn) ve bozuk yanıt sessizce "güncel" sayılır. `open` yalnızca `https://github.com/bedirhansari42/logisticedo/releases/...` adreslerini tarayıcıda açar.
- **Ağ politikası** (`net-policy.js`): yalnızca yukarıdaki tam adres (yol dahil, https, GET) izinlidir. Benzer alan adları ve başka yollar engelli kalır; testleri güncellenir.
- **Sürüm karşılaştırma** (`src/update/version.mjs`, saf, testli): `v` önekini atar, `x.y.z` karşılaştırır, ön sürümü eler, bozuk girdiyi "yeni değil" sayar. Karar mantığı (`shouldNotify`: atlanan sürüm, oturum içinde "Sonra") ayrı ve testli.
- **Arayüz** (`components/UpdateNotice.jsx`, `App.jsx`'te): açıldıktan 3 sn sonra, sonra 24 saatte bir kontrol. Başka bir pencere açıksa üstüne binmez (BackupReminder ile aynı kural). Pencere: "Yeni sürüm hazır: vX (şu an vY)", düğmeler **İndir** (release sayfası), **Sonra** (bir sonraki açılışa kadar), **Bu sürümü atla** (localStorage `lgx.update.skip`).
- **Ayarlar**: "Güncellemeleri denetle" anahtarı (varsayılan açık, localStorage `lgx.update.enabled`) ve "Şimdi denetle" düğmesi (sonuç satırı: güncel / yeni sürüm / denetlenemedi). Kapalıyken hiçbir istek gitmez.
- **Sürüm numarası**: `app.getVersion()` IPC ile okunur ve Ayarlar'da gösterilir (paketli uygulamada CI'ın etiketten yazdığı `package.json` sürümü). Geliştirmede `package.json`'daki değer görünür. `__APP_VERSION__` yedekler için kalır.
- **Test için** (yalnızca paketlenmemiş derlemede): `LGX_UPDATE_URL` adresi geçersiz kılar; paketli uygulamada etkisizdir.
- **Metinler** TR ve EN, `check-i18n` ile denetlenir. README'deki ağ cümlesi "yalnızca sürüm kontrolü, kapatılabilir" olarak güncellenir.

## Builder'a bırakılanlar

Pencerenin biçimi (mevcut `dialog` ve BackupReminder desenine uyar), CSS adları, dosya yerleşimi, IPC kanal adı ayrıntıları.

## Seçimler (benim)

- Yalnızca kararlı release'ler (`/releases/latest` zaten ön sürümü ve taslağı vermez).
- "Sonra" yalnızca oturum içindir; her açılışta tekrar çıkar. Kalıcı susturma "Bu sürümü atla" iledir.
- Release notları pencerede gösterilmez; "İndir" sayfayı açar.
