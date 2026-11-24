# logisticedo

Lojistikçiler için ücretsiz belge araçları. Kişisel portfolyo projesi olarak geliştirildi ve herkesin kullanımına açıktır. Bir proforma faturayı okur, kendi antetli kağıdınızda ihracat belgelerini üretir (PDF ve formüllü Excel). macOS ve Windows masaüstü uygulaması olarak ve tarayıcıda çalışan web sürümü olarak gelir.

**Gizlilik:** Her şey bilgisayarınızda işlenir. Dosyalarınız hiçbir sunucuya gönderilmez. Masaüstü uygulaması yalnızca yeni sürüm kontrolü için GitHub'a istek gönderir (açılışta ve 24 saatte bir; yalnızca en son sürüm numarasını okur, otomatik kontrol Ayarlar'dan kapatılabilir). Belgeleriniz ve verileriniz hiçbir yere gönderilmez, başka hiçbir ağ isteği yapılmaz. Hesap, giriş ya da reklam yoktur.

## Neler yapar

- **Proforma okuma:** PDF, Excel (.xlsx/.xls/.csv) veya Word (.docx) proformadan kalemleri, tarafları, Incoterms'i, limanları, banka bilgilerini ve toplamları okur. Okunan alanları siz kontrol edip düzeltirsiniz.
- **17 belge:** commercial invoice, packing list, palet bazlı packing list, sevkiyat talimatı, B/L taslağı, menşe beyanı, yükleme / menşe şahadetnamesi / EUR.1 talimatları, sigorta talimatı, nakliye talimatı, pre-alert, CMR veri sayfası, gümrük vekaletnamesi, satış sözleşmesi taslağı, kambiyo senedi (poliçe / bono) ve koli / palet etiketleri. Proforma ve ücretsiz (free of charge) fatura da üretilir.
- **Çıktı:** antetli PDF; commercial invoice ve packing list için ayrıca antetsiz, formüllü Excel.
- **Antet:** PDF, Word, Excel veya görsel olarak yüklenir, birden fazla antet saklanabilir.
- **Masaüstü uygulamasında ek olarak:** kayıtlı sevkiyatlar ve proformalar, panel, canlı PDF önizleme, konteyner yükleme planlayıcı (20', 40', 40' HC), ithalat maliyeti hesabı, notlar ve yedekleme.

Arayüz Türkçe ve İngilizcedir. Belgeler her zaman İngilizce üretilir.

## Kurulum

[Releases](../../releases) sayfasından macOS (`.dmg`) veya Windows (`Setup .exe` / `Portable .exe`) paketini indirin.

Paketler imzasızdır. macOS "geliştiricisi doğrulanamadı", Windows SmartScreen uyarısı verebilir. macOS'ta uygulamaya sağ tıklayıp **Aç**'ı, Windows'ta **Ek bilgi → Yine de çalıştır**'ı seçin.

## Kaynaktan çalıştırma

**Web sürümü** (derleme yok; ES modülleri `file://` ile açılmadığı için basit bir sunucu gerekir):

```bash
python3 -m http.server 8765
# tarayıcıda: http://localhost:8765
```

**Masaüstü sürümü** (Node.js gerekir):

```bash
cd desktop
npm install
npm start        # derler ve uygulamayı açar
npm run dist:mac # veya dist:win → dist/ klasöründe kurulum paketi
```

Ayrıntılı komutlar ve testler için bkz. [`desktop/README.md`](desktop/README.md).

## Klasörler

```
index.html, documents.html   web sürümü (ana sayfa ve belge oluşturucu)
assets/js/app/               belge motoru: proforma okuma, hesaplar, PDF ve Excel üretimi
desktop/                     masaüstü uygulaması (Vite + React + Electron), aynı motoru kullanır
vendor/                      yerel kütüphaneler (internetten bir şey yüklenmez)
```

## Bilinen sınırlar

- Taranmış (görsel) PDF proformalar okunamaz; Excel veya Word sürümünü yükleyin.
- Eski `.doc` biçimi okunmaz.
- Word antetleri yeniden çizilir; bilgisayarda olmayan yazı tiplerinde küçük farklar olabilir. Birebir sonuç için PDF antet kullanın.
- Excel sayfa üst bilgisine (header) gömülü logo ve şekiller okunamaz.
- Proformalar çok çeşitli olduğu için okuma bir öneridir; her alanı kontrol edin.
- CMR, EUR.1 talimatı ve vekaletname resmî form değildir; resmî / noter gerektiren işlemler için kendi belgenizi kullanın.
- İthalat maliyeti hesabı tahmindir; vergi oranlarını ve kurları siz girersiniz.

## Lisans

Bu proje [MIT lisansı](LICENSE) ile paylaşılır.

## Üçüncü taraf lisanslar

pdf.js (Apache-2.0), pdf-lib (MIT), @pdf-lib/fontkit (MIT), JSZip (MIT), docx-preview (Apache-2.0), html-to-image (MIT), ExcelJS (MIT), SheetJS Community Edition (Apache-2.0), Inter ve IBM Plex Sans (SIL OFL 1.1).
