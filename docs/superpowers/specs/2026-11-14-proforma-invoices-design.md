# Proforma Faturalar sayfası — tasarım belgesi

Tarih: 2026-11-14 · Konum: logisticedo masaüstü uygulaması (`desktop/`)

## Amaç ve neden

Satıcılar müşteriye teklifi proforma fatura ile verir; karşı taraf onaylayınca ticari fatura, packing list ve diğer sevkiyat belgelerine geçilir. Bugün uygulama proformayı yalnızca **girdi** olarak görüyor: "Yeni sevkiyat" ekranında PDF/Excel yüklenir, okunur, sevkiyat açılır. Kullanıcılar proformayı ise Excel'de elle hazırlıyor.

Bu özellik iki şey getirir:

1. Proformayı uygulamada hazırlamak (Excel yerine), antetli PDF ve formüllü Excel olarak almak.
2. **Proforma Faturalar** adlı ayrı bir sayfada tüm proformaları tutmak: hem platformda hazırlananlar hem başka yerde hazırlanıp yüklenenler. Yeni sevkiyat açılırken kullanıcı bu listeden bir proforma seçer, bilgiler sevkiyata aktarılır.

Başarı: kullanıcı teklif aşamasından sevkiyat aşamasına tek yerde, veriyi yeniden yazmadan geçer; tüm tekliflerini tek listede görür; onay ya da durum takibi yapılmaz.

## Hedefler

- Menüde **Proforma Faturalar** sayfası: liste, arama, kaynak (hazırlandı / yüklendi) göstergesi. Durum, geçerlilik ve onay kavramı yoktur.
- Proforma editörü: satıcı, alıcı (+ teslim alan), kalemler, Incoterm/ödeme koşulu, para birimi, navlun/sigorta/indirim/KDV, banka, imza, notlar. Canlı PDF önizleme.
- Çıktı: antetli PDF (İngilizce) ve antetsiz, formüllü Excel (CI ile aynı kural).
- Yükleme: PDF/Excel/CSV/ODS/DOCX mevcut ayrıştırıcıdan (`parseProforma`, tarayıcıda) geçer, listeye kaydolur; orijinal dosya saklanır ve listeden açılabilir.
- Her proforma her zaman seçilebilir: onay şartı, durum, geçerlilik süresi ya da "reddedildi" ayrımı yoktur.
- Yeni sevkiyat ekranına üçüncü yol: **Proformalarımdan seç**. Seçilen proforma sevkiyata kopyalanır (kalemler, taraflar, Incoterm, para birimi, banka, imza, proforma no/tarih; fatura no `suggestInvoiceNo` ile önerilir).
- Sevkiyata dönüşen proforma sevkiyatla bağlı kalır, durumu değişmez (proformada "Sevkiyatlar" bağlantısı, sevkiyatta "Proforma" bağlantısı). Bir proformadan birden çok sevkiyat çıkarılabilir.
- Yedek al/yükle yeni depoyu kapsar. Eski yedekler (proformalar anahtarı olmayan) sorunsuz yüklenir.
- TR + EN arayüz; belgeler İngilizce. Veri cihazdan çıkmaz.

## Hedef dışı

- Durum/onay takibi, geçerlilik süresi, reddedilenler.
- Proforma → sevkiyat dışında belge zinciri (teklif revizyon geçmişi, sürümleme).
- E-posta/WhatsApp ile gönderme, müşteri onay bağlantısı, e-imza.
- Müşteri (alıcı) veritabanı; alıcı her proformada yazılır. (Ayrı özellik olabilir.)
- Otomatik numaralandırma kuralları (yalnızca son numaradan artırılmış öneri, bkz. builder kararları).
- Panel (Dashboard) kartları, para birimi çevirisi, çoklu para birimli teklif.
- Eski statik site (`documents.html`) ve Sevkiyatlar listesindeki değişiklikler (yalnızca sevkiyattan proformaya bağlantı eklenir).
- Sevkiyat sonradan değişince proformayı güncellemek (kopya bağımsızdır).

## Anti-hedefler

- Sevkiyatı düzenlemenin proformayı sessizce bozması (bu yüzden kopya, referans değil).
- Sevkiyat silinince proformanın silinmesi ya da tersi (silme zincirlenmez; bağlantı kopar, kullanıcıya söylenir).
- Yüklenen orijinal dosyanın kaybolması ya da yedekte düşmesi.
- Dosyaların/verilerin cihazdan çıkması, dış ağ isteği.
- Proformanın sevkiyat listesine karışması.

## Kısıtlar

- Mevcut yığın: Vite + React + Electron; motor (`assets/js/app/*`) web sitesiyle paylaşılır. Motora eklenenler web sitesini bozmamalı.
- IndexedDB `DB_VERSION` 2 → 3; yükseltme mevcut verilere dokunmaz. Bellek yedek yolu (`memoryFallback`) yeni depoyu da kapsar.
- Tasarım sistemi `assets/css/base.css` + masaüstü stilleri; yeni arayüz Auros temasına uyar.
- Çeviriler `desktop/src/lib/strings.js`; `node scripts/check-i18n.mjs` geçmeli.
- Kullanıcı git'i elle yönetir: bu belge dahil hiçbir şey kendiliğinden commit edilmez.

## Yaklaşımlar

- **A) Ayrı kayıt türü / ayrı depo (seçildi).** `proformas` deposu; kayıt sevkiyatla aynı durum şeklini taşır. Artı: temiz yaşam döngüsü, sevkiyat listesi karışmaz, bir proformadan çok sevkiyat. Eksi: depo sürümü, yedek kodu ve silme ilişkileri için ek iş.
- **B) Sevkiyat kaydında `tür: proforma`.** En hızlısı; ama Sevkiyatlar ve panel karışır, ilişki bulanıklaşır. Elendi.

Kullanıcı A'yı seçti.

## Tasarım

**Kayıt şekli** (`proformas` deposu, `keyPath: id`):
`{ id, source: "created"|"imported", lhId, companyId, bankId, bankAuto, createdAt, updatedAt, state, auto, parse, summary, file: {name, type, size, blob}|null }`. Proforma–sevkiyat bağı yalnızca sevkiyat kaydındaki `proformaId` ile tutulur; "N sevkiyat" sayısı buradan türetilir (ikinci bir liste saklanmaz, silmede senkron bozulmaz).
`state` sevkiyat durumuyla aynı şekil (`createEmptyState`/`migrate`); proforma-özgü alanlar `state.proforma = { notes }` altında (migrate eksikleri doldurur). `meta.proformaNo` ve `meta.proformaDate` proformanın kendi numarası/tarihi olarak kullanılır.

**Sevkiyat tarafı:** `newShipmentRecord` kaydına `proformaId` alanı eklenir (eski kayıtlarda yok = boş).

**Mantık (saf, Node'da test edilebilir)** `desktop/src/proforma/` altında:
`model.mjs` — yeni kayıt, özet, numara önerisi; `convert.mjs` — `shipmentFromProforma(rec, {prev, company, lh})` yeni sevkiyat kaydı üretir (kopya; fatura/PL no boşaltılır, fatura no önerilir, proforma bilgileri `meta.proforma*` alanlarına kalır) (bağlantı için ayrı işlev yok: sevkiyat kaydı `proformaId` taşır).

**Depo:** `store.js` içine `listProformas/getProforma/saveProforma/deleteProforma` (shipments ile aynı kalıp, bellek yedekli). `app-context.jsx` `proformas` durumu ve `saveProforma/deleteProforma` verir.

**Yönlendirme:** `#/proformas` (liste) ve `#/pf/:id` (editör). Kenar çubuğuna "Proforma Faturalar" (Sevkiyatlar'ın üstünde, iş akışı sırasıyla); editördeyken bu giriş aktif görünür.

**Liste sayfası:** satırlar: proforma no, alıcı, tutar+para birimi, tarih, kaynak simgesi, bağlı sevkiyat sayısı. İşlemler: aç, çoğalt, sevkiyat oluştur, orijinal dosyayı aç (yüklenenlerde), sil. Üstte "Yeni proforma" ve "Dosya yükle". Boş durum metni.

**Editör:** `Editor.jsx` sevkiyat odaklı (adımlar, 17 belge); onu bozmamak için ayrı `ProformaEditor.jsx` yazılır, ortak form bileşenlerini (`FormSection`, `ItemsTable`, `Parties`, `Totals`, `Field`) ve `Preview`/`download` yardımcılarını yeniden kullanır. Adımlar: Genel (taraflar, no/tarih, koşullar), Kalemler, Banka ve imza. Form `form-schema.json`'dan çizilir; proforma için gereken ek alanlar (`proforma.notes`) şemaya `scripts/extract-form-schema.py` ile ya da elle kontrollü bölümle eklenir (bkz. builder'a bırakılanlar).

**Çıktı:** motora `renderProforma` (pdf-builder, CI'ın kalem tablosu ve toplam düzenini yeniden kullanır; başlık "PROFORMA INVOICE", notlar, banka) ve `buildProformaXlsx` (excel-builder, formüllü, antetsiz). İmza/beyan CI'dan farklı: proformada "certify" beyanı yok, yerine "This is a proforma invoice and not a demand for payment." benzeri kısa not (metin builder'da, İngilizce).

**Yükleme akışı:** `parseProforma(file)` → `applyParsed` (mevcut) → kayıt `source:"imported"`, `file` blob'u saklanır, `parse` özeti `ParseReport` ile editörde gösterilir. Şirket/antet seçimi Yeni sevkiyat ekranındaki gibi.

**Yeni sevkiyat ekranı:** "Proformalarımdan seç" bölümü: tüm proformalar (arama ile, en yeni önde), seçince sevkiyat kaydı `proformaId` ile oluşturulur, sevkiyat editörüne gidilir. Zaten sevkiyata dönmüş proforma yeniden seçilebilir (uyarı notuyla).

**Silme:** proforma silinirse bağlı sevkiyatlarda `proformaId` kalır ama bağlantı "silinmiş" gösterilir; sevkiyat silinirse proformada sayı kendiliğinden düşer (türetilmiş).

**Yedek:** `io.js` snapshot'a `proformas`, geri yüklemeye `store.saveProforma`; `backup.mjs` `validateBackup` `proformas` anahtarını isteğe bağlı sayar, `mergeById` ile birleştirir, özet sayımına ekler. Blob'lar antet blob'larıyla aynı yolla kodlanır (bkz. builder'a bırakılanlar).

**Test:** `npm run` altında Node testleri: `model` (numara önerisi, özet), `convert` (alan kopyası, bağımsızlık, bağlantı, çoklu sevkiyat), `backup` (proformalı ve proformasız eski yedek, birleştirme). Arayüz için CDP ile elle doğrulama (`reference_headless_chrome_ui_check`), test sonrası kullanıcı profilinin temizlenmesi.

## Builder kararları (benim çağrılarım, değiştirilebilir)

- Durum, geçerlilik ve onay yok (kullanıcı kararı).
- Proforma numarası serbest metin; yeni proformada son kaydın sondaki sayısı bir artırılarak öneri gelir, boşsa boş kalır.
- Yüklenen proformanın PDF'i de durumdan üretilebilir; ana işlem "orijinal dosyayı aç".

## Builder'a bırakılanlar

- Form şemasına proforma-özgü alanları eklemenin en az sürtünmeli yolu (şema betiği mi, küçük elle bölüm mü).
- Blob'ların yedek JSON'una kodlanma ayrıntısı (antetlerin bugünkü yolu neyse o).
- PDF/Excel yerleşim ayrıntıları ve proforma notunun tam metni.
- Liste sütun genişlikleri, boş durum ve rozet görünümü (mevcut Sevkiyatlar sayfasının diline uyarak).
- Eski kayıtlarda `proformaId` yokluğu için `migrate` ayrıntısı.
