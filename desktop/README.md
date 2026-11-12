# logisticedo masaüstü (macOS + Windows)

Sevkiyat odaklı masaüstü uygulaması: **Vite + React** arayüzü, **Electron** kabuğu. Belge motoru (proforma okuma, hesaplar, PDF/Excel üretimi) web sitesiyle paylaşılır: `../assets/js/app/*`. Web sitesi kodu değişmeden kalır; masaüstü yalnızca bu modülleri içe aktarır.

## Ekranlar

| Ekran | İçerik |
|---|---|
| Panel | Özet kartları, son sevkiyatlar, dikkat gerekenler, son 6 ay grafiği |
| Sevkiyatlar | Arama, durum filtresi, kopyala / sil |
| Yeni sevkiyat | Proforma yükle (okunur ve kaydedilir) ya da boş başla |
| Sevkiyat editörü | Sol: adımlar ve 17 belge (hazırlık durumu noktalı); orta: form; sağ: canlı PDF önizleme |
| Antetler | Yükle, kenar boşluğunu ayarla, varsayılan seç |
| Ayarlar | Dil, veri bilgisi, sürüm |

Sevkiyatlar IndexedDB'de (`shipments` deposu) tutulur ve her değişiklikten yarım saniye sonra kendiliğinden kaydedilir. Durumlar: taslak, belgeler hazır, yolda, teslim edildi.

## Komutlar

```bash
cd desktop
npm install              # ilk kurulum (Electron ~250 MB indirir)
npm run dev              # tarayıcıda geliştirme: http://localhost:5173 (hızlı yenileme)
npm start                # derler ve Electron penceresini açar
npm run schema           # documents.html değişirse form şemasını yeniden üretir (Python 3)
npm run dist:mac         # dist/ → .dmg + .zip (Intel + Apple Silicon)
npm run dist:win         # dist/ → Setup .exe + Portable .exe
```

Electron penceresini Vite sunucusuna bağlamak için: `npx vite` açıkken `ELECTRON_START_URL=http://localhost:5173 npx electron .`

## Sürüm yayınlama (GitHub)

`../.github/workflows/release.yml`: `v1.0.0-rc.1` gibi bir etiket gönderince macOS ve Windows paketlerini GitHub'da derler ve Releases'a yükler. Etiket `-rc`, `-beta` ya da `-alpha` içeriyorsa sürüm "pre-release" işaretlenir.

```bash
git tag v1.0.0-rc.1 && git push origin v1.0.0-rc.1
```

Depo kökü `logisticedo.com/` klasörü olmalıdır (masaüstü derlemesi `../vendor` ve `../assets` klasörlerine ihtiyaç duyar).

## Yapı

```
desktop/
  main.js                 Electron ana süreci: app:// protokolü, ağ kilidi, menü
  index.html, src/        React uygulaması
    lib/                  durum (shipment-state), kayıt hook'u (use-shipment), bağlam, yönlendirici, metinler
    lib/form-schema.json  documents.html'den üretilen form şeması (scripts/extract-form-schema.py)
    components/form/      şemadan çizilen bölümler, kalem ve palet tabloları
    pages/                Panel, Sevkiyatlar, Yeni, Editör, Antetler, Ayarlar
  scripts/                assets.mjs (vendor kopyası), check-i18n.mjs, extract-form-schema.py
  public/                 vendor/ ve yazı tipleri (derlemede kopyalanır, git'e girmez)
  app/                    Vite çıktısı (git'e girmez)
```

Çeviri anahtarlarını denetlemek için: `node scripts/check-i18n.mjs`.

## Konteyner planı

`#/planner` sayfası: karışık kutu/palet listesini 20', 40' ve 40' HC konteynere yerleştirir (tepeden, 3D ve katman görünümü, PDF yükleme planı). Motor `src/planner/*.mjs` içindedir (DOM yok); hakem `validate.mjs`. Testler: `npm run test:planner`. Yerleştirme **sezgiseldir** (uç nokta yöntemi): sonuç tahmini plandır, her zaman en iyi yerleşim olmayabilir. Hesap bir Web Worker'da yapılır; worker açılamazsa ana iş parçacığında çalışır.

## Güvenlik ve gizlilik

- Uygulama dışına giden **her ağ isteği engellenir** (`main.js` → `lockNetwork`). "Dosyalar cihazdan çıkmaz" vaadi uygulama düzeyinde zorlanır.
- Veriler kullanıcının bilgisayarında tutulur (macOS: `~/Library/Application Support/logisticedo`, Windows: `%APPDATA%\logisticedo`).
- PDF/Excel indirmelerinde işletim sisteminin "Farklı kaydet" penceresi açılır.

## Test modu

`LGX_TEST_DIR=/klasor npm start` indirmeleri sormadan o klasöre kaydeder ve pencere arka planda kalsa da çizimi durdurmaz (otomatik testler için).

## İmzalama (müşteriye vermeden önce)

Paketler **imzasız**. Müşteri bilgisayarlarında macOS "geliştiricisi doğrulanamadı", Windows SmartScreen uyarısı verir.
- **macOS:** Apple Developer hesabı (99 $/yıl) + notarization.
- **Windows:** kod imzalama sertifikası (OV/EV).

Gerekli gizli değişkenler `release.yml` içinde yorum olarak hazır.
