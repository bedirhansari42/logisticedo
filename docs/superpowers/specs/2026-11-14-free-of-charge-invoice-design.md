# Free of Charge (FOC) fatura — tasarım belgesi

Tarih: 2026-11-14 · Konum: logisticedo masaüstü uygulaması (`desktop/`)

## Amaç ve neden

Ticari değeri olmayan gönderimler (numune, garanti kapsamında yedek parça, hediye, iade) için lojistik departmanı "Free of Charge" fatura hazırlıyor. Bugün uygulamada yalnızca fiyatlı ticari fatura (CI) var; toplamlar, "amount in words" ve KDV fiyatlardan çıkıyor. Kullanıcı ücretsiz gönderimi de aynı sevkiyat akışında (packing list, CMR/B/L, etiketler vb. dahil) yürütmek istiyor; kalem ve tarafları tekrar yazmak istemiyor.

Başarı: kullanıcı "ücretsiz sevkiyat" işaretli bir sevkiyat açar, kalemleri bir kez girer, FOC faturayı ve diğer belgeleri aynı sevkiyattan PDF/Excel olarak alır.

## Kullanıcı kararları

- Yaklaşım **A**: FOC, sevkiyatın içinde yeni bir belge (ayrı liste sayfası yok). (Kullanıcı "ben diğer şirketleri bilmiyorum, sen öner" dedi; öneri A idi ve onaylandı.)
- Gönderim nedeni, gümrük değeri, belge dili, PDF antetli / Excel antetsiz formüllü: önerilen varsayılanlar, aşağıda "Builder kararları" altında işaretli.

## Hedefler

- Sevkiyat durumuna `foc: { enabled, reason, reasonOther, note }`. `enabled` ise sevkiyat "ücretsiz"dir.
- Belge **"Free of Charge Invoice"** (`foc`): CI'ın yerini alır. Ücretsiz sevkiyatta belge listesinde CI gizlenir, FOC görünür; normal sevkiyatta tersi.
- Fatura no ve tarihi mevcut `meta.invoiceNo`/`invoiceDate` alanlarını kullanır (ayrı numara yok).
- Kalemlerdeki mevcut `unitPrice`/`amount` ücretsiz sevkiyatta **gümrük değeri** olarak etiketlenir; boş bırakılabilir. Hiç değer yoksa belge "no commercial value" ibaresiyle çıkar ve fiyat sütunları yazılmaz; değer varsa "TOTAL CUSTOMS VALUE" gösterilir.
- Belgede gönderim nedeni (SAMPLE, REPLACEMENT, WARRANTY, GIFT, RETURN, OTHER + serbest metin) ve sabit beyan: "No commercial value. The goods are free of charge and their value is declared for customs purposes only." (+ varsa not).
- KDV, navlun/sigorta/indirim satırları ve banka bilgisi FOC belgesinde yok.
- Yeni sevkiyat ekranında "Ücretsiz sevkiyat (Free of Charge)" kutusu; sevkiyat editöründe Genel bilgiler adımında aynı kutu + neden alanları.
- Sevkiyat listesinde ve panelde "Ücretsiz" rozeti.
- Çıktı: PDF (antetli, `renderInvoice` `kind="foc"`), Excel (antetsiz, formüllü; ücretsiz sevkiyatta mevcut tek "Excel" işlemi FOC + packing list çalışma kitabı üretir).
- Packing list ve "tüm belgeler" PDF'i ücretsiz sevkiyatta CI yerine FOC'u kullanır; packing list'teki "Commercial Invoice" referans satırı "Free of Charge Invoice" olur.
- TR + EN arayüz; belgeler İngilizce. Veri cihazdan çıkmaz.

## Hedef dışı

- Ayrı "Ücretsiz Faturalar" liste sayfası.
- Ayrı FOC numaralandırma, gümrük mevzuatına göre otomatik değer doğrulaması, ülkeye özgü şablonlar.
- Satış sözleşmesi ve poliçe/bono belgelerini ücretsiz sevkiyatta gizlemek (görünür kalır, kullanıcı kullanmaz).
- Proforma sayfasına FOC desteği.
- Eski statik site (`documents.html`).

## Anti-hedefler

- Ücretsiz sevkiyatta ticari fatura gibi fiyat/KDV/banka bilgisi basılması (yanlış beyan izlenimi).
- "Ücretsiz" işareti kapatılınca kalem verisinin kaybolması (kalemler aynı; yalnızca belge ve etiketler değişir).
- Mevcut ticari fatura ve packing list çıktısının değişmesi (`foc.enabled` olmayan sevkiyatlarda çıktı birebir aynı kalmalı).
- Dosyaların cihazdan çıkması.

## Kısıtlar

- Eski sevkiyat kayıtlarında `foc` yoktur: `createEmptyState` varsayılanı + `migrate` ile "ücretsiz değil" olur.
- Proformadan sevkiyata dönüştürme `foc`'u sıfırlı (ücretsiz değil) bırakır; proformada FOC yok.
- Form şeması `documents.html`'den üretildiği için yeni alanlar şemaya değil, ayrı küçük bileşene (proforma notları kalıbı) yazılır; `npm run schema` çalıştırılmaz.
- Çeviriler `desktop/src/lib/strings.js`; `node scripts/check-i18n.mjs` geçmeli.
- Kullanıcı git'i elle yönetir: hiçbir şey kendiliğinden commit edilmez.
- Motor değişiklikleri web sitesini bozmamalı.

## Yaklaşımlar

- **A) Sevkiyat içinde FOC belgesi (seçildi).** Tek veri girişi, tüm belgeler tutarlı. Eksi: CI mantığına `kind` dalı eklenir.
- **B) Ayrı liste sayfası.** Sevkiyat mantığına dokunmaz ama kalem/taraf tekrar yazılır, packing list/CMR bundan beslenemez. Elendi.

## Tasarım

**Durum:** `createEmptyState().foc = { enabled: false, reason: "SAMPLE", reasonOther: "", note: "" }`. `migrate` eksik alanı varsayılanla tamamlar. `summarize` özetine `foc: state.foc.enabled` eklenir.

**Belge listesi:** `ALL_DOCS`/`DOC_GROUPS`'ta `foc` "commercial" grubuna eklenir; sevkiyat editörü grubu duruma göre süzer (`docsFor(state)`): `foc.enabled` ise `ci` yok `foc` var, değilse tersi. `DOC_SECTIONS.foc = ["A","B","C","D","F","H"]`, `DOC_ONLY.foc`: A yalnızca fatura no/tarih/sipariş no/para birimi; C yalnızca Incoterm ve yer; F `ci` ile aynı toplamlar; H yalnızca imza adı/unvanı/yeri. `USES.foc` = `[]`. `docStatus("foc")` `ci` ile aynı kurala bağlanır. Önizleme başlığı `pv.foc`. Editör, geçerli adım silinmiş/gizlenmiş belge ise `general`'a döner.

**Form:** `FocSettings` bileşeni (`components/form/FocSettings.jsx`): "Ücretsiz sevkiyat" kutusu, neden seçici (+ OTHER ise metin), not alanı. Genel bilgiler adımının başında ve FOC belge sayfasında gösterilir. Kutu kapalıyken yalnızca kutu görünür.

**Kalem tablosu:** `ctx.focMode` (sevkiyat editörü `state.foc.enabled`'dan verir) iken `Unit price`/`Amount` sütun başlıkları "Customs unit value"/"Customs value" (TR/EN çeviri), KDV % sütunu gizlenir.

**PDF:** `renderInvoice(ctx, s, kind)` `"foc"` dalı: başlık "FREE OF CHARGE INVOICE", numara çifti fatura no/tarih, "Reason for shipment" çifti, para birimi yalnızca gümrük değeri varsa; kalem tablosunda fiyat/tutar sütunları yalnızca en az bir kalemde değer varsa ve "Customs unit value"/"Customs value" başlıklarıyla; toplam kutusu yalnızca değer varsa "TOTAL CUSTOMS VALUE" (navlun/sigorta/indirim/KDV satırı yok); amount in words değer varsa; banka bloğu yok; sabit beyan + `foc.note` + imza. `buildPdf(..., "foc")` ve `"all"`'da `foc.enabled` ise CI yerine FOC. `TITLES.foc`. Packing list referans satırı `foc.enabled` ise "Free of Charge Invoice".

**Excel:** `invoiceSheet(wb, s, kind="foc")` aynı dallanma (formüller yalnızca değer varsa); `buildXlsx` `foc.enabled` ise CI sayfası yerine FOC sayfasını yazar. İndirme adı ücretsiz sevkiyatta `FOC-PL_<no>.xlsx`; PDF adı `Free-of-Charge-Invoice_<no>.pdf`.

**Yeni sevkiyat ve liste:** `NewShipment` kartında "Ücretsiz sevkiyat" kutusu; üç yol (yükle, boş, proformadan) bayrağı yeni durumun `foc.enabled`'ına yazar. `ShipmentTable` başlık hücresinde "Ücretsiz" rozeti (`summary.foc`), panelde aynı hücre bileşeni paylaşıldığından orada da görünür.

**Test:** saf mantık gerektiren parça az; `docsFor(state)` ve `focTitle`/neden yardımcıları `desktop/src/foc/*.mjs` içinde saf yazılır, `npm run test:foc` ile denenir. PDF/Excel ve arayüz başsız Chrome ile doğrulanır (`file://` + `--allow-file-access-from-files`, scratchpad `cdp.mjs`).

## Builder kararları (benim çağrılarım, değiştirilebilir)

- Gönderim nedenleri: SAMPLE, REPLACEMENT, WARRANTY, GIFT, RETURN, OTHER.
- Gümrük değeri alanı yeni değil, mevcut `unitPrice`/`amount`; boşsa "no commercial value".
- Belge numarası/tarihi CI ile aynı alanlar.
- Ücretsiz sevkiyatta CI gizli, FOC görünür; satış sözleşmesi ve poliçe/bono görünür kalır.
- FOC belgesinde banka ve KDV yok; ağırlık/paket özeti CI'daki gibi var.
- Sabit beyan metni yukarıdaki cümle (İngilizce).

## Builder'a bırakılanlar

- FOC belgesindeki tablo sütun genişlikleri ve kutu yerleşimi.
- `FocSettings` görünümü (mevcut kart diline uyarak).
- Rozetin tam stili.
- Eski adım adresinde (`#/s/<id>/ci`) ücretsiz sevkiyat açılırsa yönlendirme ayrıntısı.
