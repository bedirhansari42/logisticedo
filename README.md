# logisticedo.com

Lojistikçiler için tarayıcı tabanlı belge araçları. **Aşama 1:** proforma faturadan, kullanıcının kendi antetli kağıdında **commercial invoice** ve **packing list** üretimi (PDF + Excel).
**Aşama 2:** aynı veriden **sevkiyat talimatı (S.I.)**, **B/L taslağı** ve **menşe beyanı**, **yükleme talimatı**, **menşe şahadetnamesi talimatı** **EUR.1 talimatı**, **sigorta talimatı**, **nakliye talimatı (karayolu)**, **pre-alert**, **palet bazlı packing list**, **CMR**, **gümrük vekaletnamesi**, **satış sözleşmesi taslağı**, **kambiyo senedi (poliçe / bono)** ve **koli / palet etiketleri** (PDF; Excel yalnızca CI/PL).

Saf HTML / CSS / JavaScript. Derleme adımı yok, sunucu tarafı kod yok. Tüm dosyalar kullanıcının tarayıcısında işlenir; hiçbir şey sunucuya yüklenmez.

> **Masaüstü uygulaması:** Aynı belge motoru, `desktop/` klasöründe Vite + React + Electron ile macOS ve Windows uygulamasına paketlenir (kayıtlı sevkiyatlar, panel, canlı önizleme). Ayrıntılar ve komutlar için bkz. [`desktop/README.md`](desktop/README.md). Bu dosya yalnızca **statik web sitesini** anlatır; masaüstü sürümü bu sitenin `assets/js/app/` modüllerini paylaşır, bu yüzden oradaki değişiklikler her iki sürümü de etkiler.

## Çalıştırma (yerelde)

ES modülleri `file://` üzerinden çalışmadığı için klasörü basit bir sunucuyla açın:

```bash
cd logisticedo.com
python3 -m http.server 8765
# tarayıcıda: http://localhost:8765
```

## Yayına alma

Klasörü olduğu gibi herhangi bir statik barındırmaya yükleyin (Netlify, Vercel, Cloudflare Pages, GitHub Pages, cPanel vb.). Kütüphaneler ve fontlar `vendor/` ve `assets/fonts/` içinde, dışarıya (CDN, Google Fonts) bağımlılık yok.

## Sayfalar

| Dosya | İçerik |
|---|---|
| `index.html` | Ana sayfa: dönen noktalı küre ve limanlar arası rotalar, nasıl çalışır, araç, gizlilik |
| `documents.html` | Belge oluşturucu: antet → proforma → kontrol/önizleme → indirme |

## Akış

1. **Antet:** PDF, Word (.docx), Excel (.xlsx), PNG/JPG yüklenir. Kenar boşlukları (içerik alanı) antetteki logo ve alt bilgi bantlarından otomatik önerilir, kullanıcı sürükleyerek ayarlar. Antet IndexedDB'de saklanır; birden fazla antet kaydedilebilir. İndirme yapıldığında satıcı, banka ve imza bilgileri antetle birlikte hatırlanır.
2. **Proforma:** PDF, Excel (.xlsx/.xls/.csv), Word (.docx). Kalem tablosu, satıcı/alıcı/consignee/notify, Incoterms ve yer, ödeme şekli, limanlar, menşe, para birimi, navlun/sigorta/indirim, ağırlık/kap/hacim özetleri ve banka bilgileri okunur. Kalem toplamı proformadaki toplamla karşılaştırılır.
3. **Kontrol:** Okunan alanlar yeşil işaretlidir. Canlı önizleme, indirilecek PDF'in kendisidir. Excel'den çok satırlı yapıştırma ve toplam ağırlık/kap/hacmi kalemlere dağıtma desteklenir. Çalışılan belge yalnızca oturum boyunca (sessionStorage) tutulur: sayfa yenilenince kalır, sekme/tarayıcı kapanınca silinir. Kalıcı olarak yalnızca antetler saklanır.
4. **İndirme:** Commercial invoice, packing list, sevkiyat talimatı, B/L taslağı, menşe beyanı (tek tek PDF), hepsi tek PDF, formüllü Excel (CI + PL, iki sayfa). Sevkiyat/B/L, menşe ve talimat alanları formdaki I–T bölümlerinde. Etiketler farklı sayfa boyutunda olduğu için "tüm belgeler tek PDF"e girmez. Önizlemede belge, gruplu bir seçiciden (Commercial / Shipment / Instructions / Origin and customs) seçilir.

Arayüz Türkçe/İngilizce; belgeler her zaman İngilizce üretilir.

## Kod yapısı

```
assets/
  css/        base.css (tasarım sistemi), home.css, app.css
  js/
    i18n.js, common.js, home.js
    app/
      main.js            arayüz denetleyicisi
      store.js           IndexedDB (antetler; masaüstü sürümü için sevkiyatlar, DB sürümü 2)
      loader.js          kütüphaneleri ihtiyaç anında yükler (masaüstü, kök adresi globalThis.__LGX_BASE__ ile verir)
      letterhead.js      antet işleme + otomatik kenar boşluğu
      excel-render.js    Excel antetini sayfa görüntüsüne çizer
      doc-model.js       durum, hesaplar, yazıyla tutar, biçimler
      pdf-builder.js     belgeler (pdf-lib, IBM Plex Sans gömülü)
      excel-builder.js   Excel çıktısı (ExcelJS)
      preview.js         pdf.js ile önizleme
      parse/             proforma okuma: extract-pdf / extract-sheet / extract-docx → analyze
  fonts/      Inter (arayüz), IBM Plex Sans (PDF, Türkçe karakter desteği)
vendor/       pdf.js, pdf-lib, fontkit, JSZip, docx-preview, html-to-image, ExcelJS, SheetJS
```

## Bilinen sınırlar

- Taranmış (görsel) PDF proformalar okunamaz; kullanıcıya Excel/Word sürümünü yüklemesi söylenir.
- Eski `.doc` biçimi okunmaz (`.xls` proforma okunur).
- Word antetleri tarayıcıda yeniden çizilir; bilgisayarda olmayan yazı tiplerinde küçük farklar olabilir. Birebir sonuç için PDF antet önerilir.
- Excel'de sayfa üst bilgisine (header) gömülü logolar ve şekiller okunamaz.
- Proformalar çok çeşitli olduğu için okuma bir öneridir; her alan kullanıcı onayından geçer.

## Lisanslar

pdf.js (Apache-2.0), pdf-lib (MIT), @pdf-lib/fontkit (MIT), JSZip (MIT), docx-preview (Apache-2.0), html-to-image (MIT), ExcelJS (MIT), SheetJS Community Edition (Apache-2.0), Inter ve IBM Plex Sans (SIL OFL 1.1).
