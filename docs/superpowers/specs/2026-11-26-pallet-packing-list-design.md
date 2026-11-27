# Palet bazlı packing list: yeniden tasarım

Tarih: 2026-11-26 · Kapsam: masaüstü uygulaması (`desktop/`) + paylaşılan motorun palet çıktıları

## Amaç ve neden

"Packing list by pallet" belgesi yüklemenin gerçek hâlini göstermeli. Bugün "Kalemlerden oluştur" her kalem için kap sayısı kadar ayrı palet üretiyor; bütün kartonlar tek paletteyken bile belgede birden çok palet görünüyor. Palet satırları kalemlere bağlı değil (içerik serbest metin), bu yüzden HS kodu ve miktar belgeye düzgün yansımıyor.

Gerçekte ambalaj katmanlıdır: ürün → karton (iç ambalaj; kalemdeki "kap sayısı/cinsi") → palet (dış taşıma birimi). Kullanıcı belgeyi hazırlarken hangi palette hangi kartonların, hangi üründen kaç adet olduğunu bilir. Paletler tartılır; brüt ağırlık tartıdan gelir.

## Hedefler

- Belgede önce paletler, her paletin altında o paletteki ürünler (kalemlere bağlı içerik satırları) görünür. Hepsi tek paletteyse tek palet görünür.
- İçerik satırı karton sayısını ve/veya miktarı taşır; açıklama, HS kodu, birim kalemden gelir (kalem düzeltilince belgeye yansır).
- Karton numaraları (C/No.) kendiliğinden verilir ve paletler boyunca sürer.
- Dağıtılmamış ya da fazla dağıtılmış kartonlar/miktarlar uyarılır.
- Hızlı başlangıç: "Hepsini tek palete koy"; her palette "Kalanları buraya ekle".
- Yedekler yeni yapıyı taşır; eski biçimli yedek ve kayıtlar yeni yapıya çevrilerek açılır, veri kaybolmaz.

## Hedef dışı

- Statik web sitesi (`documents.html`, `assets/js/app/main.js`) palet ekranı güncellenmez. Motor eski biçimi basmaya devam ettiği için site bozulmaz.
- Excel çıktısına palet sayfası eklenmez.
- B/L, SI, CI/PL "toplam koli" alanlarının "2 PALLETS STC 13 CARTONS" biçimine geçmesi (sonra ayrıca konuşulabilir).
- Konteyner planlayıcı ile palet verisinin bağlanması.

## Anti-hedefler

- Eski sevkiyatlardaki elle yazılmış palet içeriğinin sessizce kaybolması.
- Kalem tablosundaki karton sayısıyla palet sayfasının sessizce çelişmesi (iki yerde iki farklı sayı ve uyarı yok).

## Yaklaşımlar

- **A. Palet blokları (seçildi).** Her palet bir kart: başlıkta no, cins, ölçü, net, brüt; altında "ürün ekle" ile seçilen içerik satırları (karton, miktar, C/No.). Belgeyle aynı düzende; bir ürünü paletlere bölmek doğal; 1 ya da 30 palet aynı rahatlıkla. Çok kalem × çok palette tıklama artar, hızlı düğmelerle hafifletilir.
- **B. Ürünler × paletler tablosu.** Dağılım tek bakışta görünür ama palet sayısı arttıkça yana taşar; palet bilgileri (ölçü/ağırlık) için ayrı yer gerekir; miktar girmek zorlaşır.
- **C. Kalem tablosuna "palet no" sütunu.** En az değişiklik ama bir ürünün paletlere nasıl bölündüğü (kaç kartonu hangisinde) ifade edilemez; ihtiyacı karşılamaz.

Kullanıcı A'yı seçti.

## Veri modeli

`state.pallets[]` (motor, `assets/js/app/doc-model.js`):

```
pallet = { id, no, type, dimensions, net, gross, contents, lines: [line] }
line   = { id, itemId, cartons, qty }      // cartons/qty: sayı metni ("" = boş)
```

- `contents`: eski serbest metin. Yeni paletlerde boş; eski kayıtlarda korunur (aşağıda Geçiş).
- `lines[].itemId`: `state.items[].id`. Açıklama/HS/birim her zaman kalemden okunur; satırda kopyası tutulmaz.
- `no`: boşsa sıra numarası basılır (bugünkü gibi).

## Hesaplar (saf işlevler, testli)

Yeni modül: `assets/js/app/pallets.js` (motorda, PDF ve masaüstü birlikte kullanır; DOM yok).

- **Karton numaraları:** paletler ve satırlar sırasıyla gezilir; kartonu > 0 olan satıra `başlangıç-bitiş` aralığı verilir (tek kartonda tek sayı). Kartonu boş satırın C/No.'su yoktur.
- **Satırın miktarı:** `qty` doluysa o. Boşsa ve kalemin kap sayısı ile miktarı biliniyorsa `kalem.qty × cartons / kalem.packages` (öneri; arayüzde yer tutucu, belgede basılır). Hiçbiri yoksa boş.
- **Paletin net ağırlığı:** `net` doluysa o. Boşsa satırların kalem net ağırlığından payı toplamı (pay = cartons/packages, yoksa qty/kalem.qty). Öneri olarak gösterilir, boşsa belgeye basılır.
- **Paletin brüt ağırlığı:** tartılan değer elle girilir. *Benim kararım:* boşsa aynı yöntemle kalem brütlerinden öneri gösterilir ve basılır (uygulamadaki "boşsa kalemlerden hesapla" alışkanlığıyla tutarlı).
- **Dağıtım denetimi (kalem başına):** atanan karton toplamı ↔ `kalem.packages`; atanan miktar toplamı (girilen ya da önerilen) ↔ `kalem.qty`. Sonuç: `{ itemId, cartons: {total, assigned}, qty: {total, assigned}, status: "ok" | "under" | "over" }`. Boş satırlar (açıklama ve miktarı olmayan kalemler) sayılmaz.
- **Sahipsiz satır:** kalemi silinmiş satır. Arayüzde uyarıyla görünür (silinebilir), belgeye basılmaz.

## Düzenleme ekranı (`desktop/src/components/form/PalletsTable.jsx` yeniden yazılır)

```
[ Hepsini tek palete koy ]  [ + Palet ekle ]        Dağıtılmamış: Gateway 2 karton ⚠

┌ Palet [1] · [PALLET ▾] · [120x80x150] · Net [310*] · Brüt [335] ───────── [sil]
│ Ürün                          HS        Karton   Miktar      C/No.
│ Endüstriyel IoT Sensör        8517.62   [5]      [50*] PCS   1-5     [x]
│ Telemetri Gateway             8517.62   [3]      [3*]  PCS   6-8     [x]
│ [ + ürün ekle ▾ ]   [ Kalanları buraya ekle ]
└──────────────────────────────────────────────────────────────
(* = boşsa önerilen değer, yer tutucu olarak)
```

- "Hepsini tek palete koy": paletler boşsa tek palet oluşturur, her dolu kalem için kalan karton/miktarla bir satır ekler. Palet varsa onay sorar ve yerine koyar.
- "Kalanları buraya ekle": o palete, henüz dağıtılmamış karton/miktarı olan her kalem için kalan kadar satır ekler (aynı kalemin satırı varsa onu artırır).
- "Ürün ekle": dolu kalemlerin listesi (açıklama + kalan karton); seçilen kalem kalan kadar karton ile eklenir.
- Dağıtım özeti bölümün başında: her şey dağıtılmışsa yeşil "Tüm kartonlar paletlerde"; değilse kalem kalem eksik/fazla.
- Her paletin bir "Not" alanı vardır (`contents`; eski kayıtlarda eski içerik metni burada görünür). Doluysa belgede palet başlığının altında basılır; kullanıcı düzenleyebilir ya da silebilir.
- Belge durumu (sol menü noktası, `docStatus("pallet")`): palet yoksa empty; dağıtım eksik/fazla ya da sahipsiz satır varsa partial; aksi hâlde ready.

## PDF (`renderPalletList`, motor)

```
Pallet/Pkg   Type     Dimensions     Net (kg)   Gross (kg)
PALLET 1     PALLET   120x80x150     310.00     335.00          ← palet başlık satırı (kalın, dolgulu)
  C/No.   Description                  HS Code   Qty       Cartons
  1-5     Industrial IoT Sensor Module 8517.62   50 PCS    5
  6-8     Telemetry Gateway            8517.62    3 PCS    3
PALLET 2 ...
TOTAL: 2 PALLETS STC 13 CARTONS          Net 490.00   Gross 535.00
```

- Tek tablo, iki tür satır (palet başlığı + içerik). Uygulama: mevcut `Doc.table` satır türleriyle; gerekiyorsa tablo bölümleri yerine başlık satırı `bold+fill`, içerik satırları girintili.
- HS sütunu: en az bir içerik satırının kaleminde HS varsa ve `options.showHsOnPl` açıksa. "-" boş basılır (girdi `forPrint`'ten geçer).
- Sütunlar yalnızca veri varsa: Dimensions, Volume (ölçüden), C/No., Cartons.
- Not (`contents`) doluysa palet başlığının altında tek satır olarak basılır; eski biçimli paletlerde bu, bugünkü çıktıyla eşdeğerdir.
- Özet bloğu: toplam palet, toplam karton, net, brüt, hacim; Marks & Numbers.

## Etiketler (`labelList`, kaynak "pallets")

- Palet başına bir etiket; açıklama = paletteki kalem açıklamaları (eski biçimde `contents`); brüt = paletin brütü (boşsa öneri). Diğer davranış aynı.

## Zorunlu alanlar

- *Benim kararım (itiraz edilebilir):* palet listesi de bir packing list olduğu için `DOC_RULES.pallet = ["hsCode"]` eklenir; HS kodu boş kalem varsa palet listesi indirmesi engellenir ve Kalemler sayfasına götürür (mevcut mekanizma). İstenmezse tek satır kaldırılır.

## Geçiş ve yedekler

- **Kayıtlar:** `migrate()` (`desktop/src/lib/shipment-state.js`) paletleri normalize eder: `lines` yoksa `[]`; satırlar yalnız nesne + metin `id`/`itemId` ise kalır, `cartons`/`qty` metne çevrilir; palet alanları metne çevrilir. Eski `contents` korunur. Otomatik dönüştürme (metni kaleme eşlemeye çalışma) yapılmaz: metin serbest ve güvenilmez.
- **Yedek alma:** palet yapısı `state` içinde olduğu için yedeğe kendiliğinden girer; ek iş yok. Test: yeni yapılı sevkiyat yedek → geri yükleme → açma döngüsünde satırlar korunur.
- **Geri yükleme:** `planRestore` `state`'i düz JSON olarak geçirir; açılışta `migrate()` normalize eder. Test: eski biçimli palet içeren yedek geri yüklenip açılınca `contents` korunur, `lines=[]`; bozuk satırlar (nesne olmayan, kimliksiz) düşer ve ekran çökmez.
- **Eski uygulama sürümü yeni yedeği açarsa:** paletler içerik metni olmadan görünür (bilinen sınırlama; uygulama içi güncelleme olduğu için kabul).
- **Kopyalama (`duplicateRecord`):** kalem kimlikleri kopyada aynı kaldığı için satırlar geçerli kalır; kontrol testi.

## Testler

- `assets/js/app/pallets.js` için birim testleri (`desktop/src/pallets/*.test.mjs` ya da motor yanında; `npm run test:pallets`): C/No. aralıkları, önerilen miktar/net/brüt, dağıtım durumu (ok/under/over, kap sayısı yok, miktar yok), sahipsiz satır, "hepsini tek palete" ve "kalanları buraya" işlemleri, `migrate` normalizasyonu, yedek döngüsü.
- Uçtan uca (Electron + CDP): proforma → hepsini tek palete → PDF metninde tek palet ve tüm kalemler; bir kalemi ikinci palete bölme → C/No. ve uyarılar; eski biçimli kayıt açılışı; HS "-" boş basılır.

## Okuma sırasında verilen küçük kararlar (benim kararım)

- **"Karton" sözcüğü:** kalemlerin kap cinsi farklı olabilir (BOX, CARTON, BAG). PDF'te sütun başlığı ve özet, dolu kalemlerin kap cinsi tekse onu (ör. "CARTONS"), değilse "PACKAGES" kullanır. Arayüzde sütun adı "Kap".
- **Kaleme bağlı olmayan içerik** (ör. kılavuz kutusu): yeni paletlerde satırlar yalnız kalemlerden seçilir; faturaya girmeyen bir şey gerekiyorsa paletin "Not" alanı (eski `contents` alanı, artık her palette görünür, başlık satırının altında basılır) kullanılır.

## Kurucuya bırakılanlar

- Kart görünümünün ayrıntılı stili (Auros teması, mevcut `.items` tablo stilleri yeniden kullanılır).
- Önerilen değerlerin yuvarlama ayrıntısı (miktar tam sayıysa tam, değilse 3 ondalık; ağırlık 2).
- Çok uzun palet listelerinde kartları daraltma/açma.
