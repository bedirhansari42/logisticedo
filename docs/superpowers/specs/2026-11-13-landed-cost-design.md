# İthalat maliyet (landed cost) hesaplayıcı — tasarım belgesi

Tarih: 2026-11-13 · Konum: logisticedo masaüstü uygulaması (`desktop/`)

## Amaç ve neden

Türkiye'ye ithalat yapan firmalar ve onlara hizmet veren lojistikçiler, bir sevkiyatın malı kapıya geldiğinde gerçekte kaça mal olduğunu çoğunlukla elle ya da bozulmaya açık Excel dosyalarıyla hesaplıyor. Kalemler arasında navlun ve sigortanın paylaştırılması, gümrük kıymetinden vergilerin sırayla hesaplanması ve KDV'nin maliyete girip girmemesi hataya açık. Bu araç, proforma faturadaki kalemleri alıp kalem kalem ve toplam maliyeti çıkaracak; hem gümrükte ödenecek nakit tutarı hem gerçek birim maliyeti gösterecek.

Başarı: kullanıcı proformayı yükler (ya da kalemleri yazar), navlun, sigorta, kur ve vergi oranlarını girer; saniyeler içinde kalem başına ve toplam ödenecek vergileri, KDV hariç gerçek maliyeti ve birim maliyeti görür; PDF ve formüllü Excel olarak alır. Formüllü Excel, kullanıcının oranı değiştirip sonucu kendisinin yeniden görmesini sağlar.

Kullanım yerleri (web araştırmasından, kesin veri değil): tedarikçi tekliflerini aynı tabana çekip karşılaştırmak, birim maliyetten satış fiyatı çıkarmak, gümrük öncesi nakit ihtiyacını bütçelemek. İlk sürüm bu üçünden "kalem bazlı maliyet ve nakit ihtiyacı"nı kapsar; teklif karşılaştırma kapsam dışıdır.

## Hedefler

- Türkiye ithalatı için kalem bazlı landed cost: gümrük kıymeti (CIF), gümrük vergisi, ek mali yükümlülük (EMY), KKDF, ÖTV (varsa), KDV, yurt içi masraflar.
- Proforma PDF'ten kalemleri mevcut ayrıştırıcıyla (tarayıcıda) okumak; elle ekleme/düzenleme de mümkün.
- Navlun, sigorta ve yurt içi masrafları kalemlere paylaştırmak (değere, ağırlığa, hacme ya da adede göre).
- Sonuçta ayrı ayrı göstermek: gümrükte ödenecek toplam vergi (nakit), indirilebilir KDV, KDV hariç toplam maliyet ve kalem başına birim maliyet.
- PDF (İngilizce, antetsiz) ve formüllü Excel çıktısı.
- TR + EN arayüz; çıktı belgeleri İngilizce (projenin genel kuralı).
- Veri cihazdan çıkmaz: sunucu, yapay zeka, dış ağ isteği ya da çevrimiçi oran/kur sorgusu yok.

## Hedef dışı

- Türkiye dışındaki ülkeler. (Kural seti ülke profili olarak ayrı bir modülde durur ki ileride eklenebilsin, ama ilk sürümde yalnızca Türkiye yazılır.)
- Birden fazla tedarikçi teklifini yan yana karşılaştırma.
- Sevkiyat kayıtlarına bağlama (planlayıcıdaki gibi bağımsız bir araç).
- Oran/kur veritabanı, GTİP sınıflandırma, çevrimiçi güncel oranlar.
- Gümrük beyannamesi ya da resmî vergi hesabı yerine geçmek. Sonuç tahmindir.
- Antetli PDF.
- Eski statik siteye (documents.html) eklemek.

## Anti-hedef

- Uydurma ya da eski bir oranı resmî gibi göstermek. Araç hiçbir vergi oranını kendisi bilmez; oranlar kullanıcının girdisidir ve çıktıda "kullanıcı girişi, tahmini" notu vardır.
- Aynı kalemi iki kez vergilendirmek (KDV'nin kendi üzerine eklenmesi, navlunun hem kıymete hem tekrar maliyete girmesi) gibi sessizce yanlış toplam.
- Kuruş farkı yüzünden kalem toplamlarıyla genel toplamın tutmaması.
- Dosyaların ya da verilerin cihazdan çıkması.

## Kullanıcı kararları

- Önce navlun/landed cost aracı; delivery note sonraya.
- İlk sürüm: Türkiye'ye ithalat, proformadan kalem okuma, navlun ve sigortayı paylaştırma, vergileri hesaplama, PDF + Excel. Çoklu teklif karşılaştırması ve başka ülkeler sonraya.
- Veri cihazdan çıkmaz (sitenin temel vaadi); bu yüzden oranlar internetten çekilmez, kullanıcı girer.

## Yapım sırasında benim kararlarım (kullanıcı onayına açık)

- **Yer ve yapı:** Planlayıcı gibi bağımsız sayfa: kenar menüde "Maliyet" (`#/landed`), motor `desktop/src/landed/*.mjs` (arayüzden bağımsız, `node --test` ile test edilir), sayfa `desktop/src/pages/Landed.jsx`. Taslak localStorage'da (`lgx.landed`); kayıtlı hesap listesi yok.
- **Hesap sırası (kalem başına):**
  1. Kalem bedeli (fatura para biriminde) → TRY (kur ile).
  2. Gümrük kıymeti (CIF) = kalem bedeli + paylaştırılan navlun + paylaştırılan sigorta (yalnızca Türkiye sınırına kadar olan kısım). Fatura fiyatına zaten dahil olan kalem eklenmez (Incoterm'e göre; aşağıda).
  3. Gümrük vergisi = CIF × oran. EMY = CIF × oran. KKDF = CIF × oran. Diğer vergi/resim (ilave gümrük vergisi, damping vb.): kalem başına oran (CIF'in yüzdesi) ya da sabit tutar (ör. kg başına özel vergiyi kullanıcı toplam tutar olarak yazar); varsayılan boş.
  4. ÖTV (varsa) matrahı = CIF + gümrük vergisi + EMY + diğer vergi/resim; ÖTV = matrah × oran.
  5. KDV matrahı = CIF + gümrük vergisi + EMY + KKDF + diğer vergi/resim + ÖTV; KDV = matrah × oran. (KDV Kanunu 21/b: ithalatta ödenen vergi, resim, harç ve fon payları matraha girer; KKDF dahildir. Web kaynaklarından özetlendi, resmî metinle doğrulanmadı; çıktıda formül yazılıdır ve KKDF'yi matrahtan çıkarmak için hesap başına bir anahtar vardır, varsayılan "dahil".)
  6. Landed cost (KDV hariç) = CIF + gümrük vergisi + EMY + KKDF + diğer vergi/resim + ÖTV + paylaştırılan yurt içi masraflar. KDV "indirilebilir" ise maliyete girmez; değilse maliyete eklenir (genel anahtar, varsayılan "indirilebilir").
- **Incoterm:** Seçim, navlun ve sigortanın fatura fiyatına dahil olup olmadığını önceden doldurur (EXW/FCA/FOB: ikisi ayrı eklenir; CFR/CPT: navlun dahil, sigorta ayrı; CIF/CIP: ikisi dahil). Her satırda kullanıcı "faturaya dahil" işaretini elle değiştirebilir.
- **D terimleri (DAP/DPU/DDP):** Fatura fiyatı sınır sonrası (Türkiye içi) taşımayı da içerir, bu kısım gümrük kıymetine girmez. Kullanıcı "Türkiye içi nakliye (faturaya dahil)" tutarını girer; bu tutar CIF hesabında fatura değerinden **düşülür** (kalemlere paylaştırılarak). Navlun hem sınır öncesi hem sonrası bölünecekse iki ayrı satır girilir (sınır öncesi: "faturaya dahil" işaretli ya da değil; sınır sonrası: düşülecek satır). DDP'de vergiler fiyata dahildir; v1 bunu hesaplamaz, yalnızca "DDP: vergiler fiyata dahildir, vergisiz tutarı girin" uyarısı gösterir.
- **Sigorta yoksa:** Sigorta fiyata dahil değilse ve sigorta tutarı girilmemişse, seçenek açıkken götürü sigorta eklenir: matrah = mal bedeli + navlun (navlun ister faturaya dahil ister ayrı eklenmiş olsun), oran %3 (anahtar, varsayılan açık; çıktıda belirtilir). D terimlerinde sınır sonrası düşülen kısım matraha girmez.
- **Kur:** Kullanıcı kullanılan her para birimi için TRY kurunu elle girer ("tescil tarihindeki gümrük kuru" uyarısıyla). Navlun, sigorta ve masraf satırlarının her biri kendi para birimini seçer.
- **Paylaştırma anahtarı:** Her masraf satırı için seçilir: değere / ağırlığa / hacme / adede göre. Varsayılanlar: navlun → ağırlık (yoksa hacim, yoksa değer), sigorta → değer, yurt içi masraflar → değer. Seçilen anahtar için kalemlerde veri eksikse kullanıcıya bildirilir, sessizce değere düşmez.
- **Yuvarlama:** Her adımda (kalem TRY bedeli, paylaştırılan masraflar, CIF, her vergi, kalem landed cost) TRY'de iki ondalığa yuvarlanır; toplam, yuvarlanmış kalem değerlerinin toplamıdır, böylece genel toplam ile kalem toplamları her zaman tutar. Masraf paylaştırmasında kalan kuruş son kaleme verilir (mevcut `allocate` mantığına benzer).
- **Excel uyumu:** Excel uygulamayla birebir aynı sonucu vermelidir. Her adımda `ROUND(...,2)` kullanılır; paylaştırmada son kalem = toplam − öncekilerin toplamı formülüyle bulunur. Testler uygulama sonucunu Excel formüllerinin bir değerlendiricisiyle (ya da elle hesaplanmış örneklerle) karşılaştırır.
- **Yurt içi masrafların KDV'si:** Her masraf satırında isteğe bağlı KDV oranı vardır (varsayılan ayarlanabilir alandan, başlangıçta %20; boş = KDV yok). Bu KDV "gümrükte ödenecek nakit"e girmez; sonuçta ayrı bir "masraf KDV'si" olarak gösterilir. "KDV indirilebilir" anahtarı kapalıysa hem mal KDV'si hem masraf KDV'si maliyete eklenir.
- **KDV oranı:** Kalem başına girilir; varsayılan değer ayarlanabilir bir alanda durur (başlangıçta %20, kullanıcı değiştirir). Gümrük/EMY/KKDF/ÖTV oranı varsayılan boştur, boş = %0 sayılır ama "oran girilmedi" uyarısı gösterilir.
- **Proforma aktarımı:** Mevcut `@engine` ayrıştırıcısıyla kalem adı, adet, birim fiyat, para birimi ve varsa HS kodu alınır; ağırlık/hacim ayrıştırıcı bulursa alınır, yoksa kullanıcı girer. Ayrıştırma raporu (neyin okunamadığı) mevcut `ParseReport` bileşeniyle gösterilir.
- **Çıktı dili:** PDF ve Excel İngilizce (planlayıcıyla aynı), antetsiz. PDF: girişler (kur, Incoterm, masraflar), kalem tablosu, toplamlar, formüllerin kısa açıklaması ve "estimate — rates entered by user" uyarısı. Excel: giriş sayfası ve hesap sayfası; oranlar ve kurlar hücre, hesaplar canlı formül.
- **Hesap tarayıcıda/uygulamada yapılır;** küçük hesap olduğu için Web Worker gerekmez.
- **Oran hatırlama:** İlk sürümde GTİP başına oran kaydı yok (fikir olarak not edildi).

## Builder'a bırakılanlar

- Sayfanın yerleşimi (giriş formu, kalem tablosu, sonuç özeti), adımlar ya da tek ekran.
- Excel formül düzeni ve hücre adlandırması; PDF sayfa düzeni.
- Proforma ayrıştırıcı çıktısının kalem alanlarına eşlenmesinin ayrıntıları ve ağırlık/hacim yoksa kullanıcıya gösterim biçimi.
- Giriş doğrulama ve hata metinleri (sayı biçimi için planlayıcıdaki `read`/`parseItemRow` yaklaşımı kullanılabilir).
- Testler: bilinen örneklerle (elle hesaplanmış) CIF, vergi sırası, KDV matrahı, paylaştırma ve yuvarlama tutarlılığı; Incoterm'e göre dahil/ayrı durumları; sigorta %3 kuralı.

## Bilinen kısıtlar

- `desktop/` Vite + React; motor `assets/js/app/*` ile paylaşılıyor, `@engine` alias'ı ile içe aktarılıyor; hesap modülü kendi küçük modülü olmalı, motoru bozmamalı.
- Çeviriler `desktop/src/lib/strings.js` içinde; `node scripts/check-i18n.mjs` ile denetlenir. Yönlendirme `desktop/src/lib/router.js`, menü `Sidebar.jsx` içindeki `NAV`.
- Excel için mevcut ExcelJS yaklaşımı (`excel-builder.js`) kullanılır; ExcelJS'te `eachRow({includeEmpty:false})` yalnızca kenarlığı olan satırları atlar.
- PDF için `pdf-lib` + IBM Plex Sans (Inter + fontkit `subset:true` glifleri bozuyor).
- Paketler imzasız, lisans/ödeme yok; bu özellik onlara dokunmaz.
- Vergi kuralları (KDV matrahı ve KKDF'nin dahil olması, %3 götürü sigorta, EMY/KKDF tabanları) web araştırmasından özetlendi; resmî kaynakla (Gümrük ve Ticaret Bakanlığı tarifesi, KDV Kanunu) doğrulanmadı. Çıktıdaki formül açıklaması bu yüzden açık yazılır.
- İlk sürümde ele alınmayan: ÖTV teminatı gibi özel durumlar, DDP'de vergilerin fiyattan ayrıştırılması, gözetim/korunma önlemlerinde KDV indirimi kısıtları. Bunlar "diğer vergi/resim" sütunu ve açıklama notlarıyla kullanıcıya bırakılır.
