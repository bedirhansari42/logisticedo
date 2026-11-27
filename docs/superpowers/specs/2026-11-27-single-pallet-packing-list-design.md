# Packing List: "Tüm mal tek palette" seçeneği — kısa tasarım (2026-11-27)

## Neden
Bazı kullanıcılar "Packing List by Pallet" yerine doğrudan kalem bazlı Packing List hazırlıyor. Mal tek paletteyse bunu ve paletin ölçüsünü Packing List'te gösterebilmeliler; palet sayfasını açmak zorunda kalmamalılar.

## Hedefler
- Paketleme adımında "Tüm mal tek palette" kutusu + palet ölçüsü alanı.
- İşaretliyse kalem bazlı Packing List PDF'i tek paleti ve ölçüsünü yazar.

## Hedef dışı
- Fatura, B/L, CMR, sevkiyat talimatı gibi öteki belgeler değişmez (kullanıcı kararı: yalnız Packing List).
- Palet ağırlığı (dara) alanı yok; brüt ağırlık kalemlerden ya da elle girilen toplamdan gelir.
- Paletler sayfasıyla veri paylaşımı yok; "Packing List by Pallet" belgesi etkilenmez.
- Paletler sayfasında palet varken uyarı notu bu adımda yok (form şemadan çiziliyor, koşullu not için özel bileşen gerekir; istenirse sonra).

## Yaklaşımlar
- **A) Paketleme adımına kendi alanları — SEÇİLDİ.** `state.packing` içinde iki alan; basit, palet verisine dokunmaz. Eksisi: palet sayfası da doldurulursa ölçü iki yerde durabilir.
- B) Paletler sayfasıyla ortak veri (kutu tek palet oluşturur). Elendi: mevcut çoklu paletleri silmek zorunda kalır, kutunun anlamı belirsizleşir.

## Tasarım
- Durum: `packing.onePallet` (false), `packing.palletDims` ("") — `createEmptyState` varsayılanı; eski kayıtlar `migrate` ile tamamlanır.
- Form: `documents.html` Paketleme (F) bölümüne kutu + "Palet ölçüsü (cm)" alanı (placeholder `120x80x150`); `npm run schema` ile masaüstü formuna geçer. Statik site de aynı motoru kullandığı için orada da çalışır. Metinler TR/EN.
- PDF (`renderPacking`), yalnız kutu işaretliyse:
  - "Shipment summary"de "Total Packages" → `ONE (1) PALLET, STC TWELVE (12) CARTONS` (kap metni yoksa yalnız `ONE (1) PALLET`).
  - "Pallet Dimensions" satırı: ölçü üç sayı olarak okunabiliyorsa `120 x 80 x 150 CM`, değilse yazıldığı gibi; boşsa satır yok.
  - Hacim: kalemlerden/elle toplam hacim yoksa ve ölçü okunabiliyorsa palet hacmi (`palletVolume`).
  - Tablonun TOTAL satırı değişmez.
- Metin üretimi saf fonksiyonda (motor, Node testli); PDF yalnız onu çağırır.

## Builder'a kalan
- Saf fonksiyonun adı/yeri, alan yerleşimi (kutu ve ölçünün Paketleme bölümündeki yeri).
