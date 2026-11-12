# Konteyner planlayıcı — tasarım belgesi

Tarih: 2026-11-11 · Konum: logisticedo masaüstü uygulaması (`desktop/`)

## Amaç ve neden

Lojistikçiler elindeki karışık ölçülü kutu ve paletlerin bir konteynere kaç adet sığacağını, hangi yönde duracağını ve hangi sırayla yükleneceğini elle hesaplıyor; bu hem zor hem hataya açık. Planlayıcı bu listeyi girdi olarak alıp konteyner yerleşimini hesaplayacak ve çizimle gösterecek. Çizim şoföre/depoya verilebilecek bir yükleme planı olarak da kullanılacak.

Başarı: kullanıcı kalemleri yazar, birkaç saniye içinde hangi konteynere ne kadar sığdığını, doluluk oranını ve çizimi görür; yükleme sırası PDF olarak çıkar.

## Hedefler

- Karışık ölçülü kalemleri (kutu, palet) 20', 40' ve 40' HC konteynerlere yerleştirmek.
- Tepeden, 3D ve katman katman çizim; yükleme sırası numaralı.
- PDF çıktısı (yazdırılabilir yükleme planı).
- TR + EN arayüz; çıktı belgesi İngilizce (projenin genel kuralı).
- Veri cihazdan çıkmaz: sunucu, yapay zeka ya da dış ağ isteği yok.

## Hedef dışı

- Eski statik siteye (documents.html) eklemek.
- Sevkiyatlara bağlamak, kayıtlı sevkiyatlarla ilişkilendirmek. Planlayıcı bağımsız bir araçtır.
- Packing list'ten otomatik içe aktarma. Kalemler elle yazılır.
- Ağırlık sınırı kontrolü (kullanıcıda sorun olmadı). Ağırlık yalnızca isteğe bağlı bilgidir.
- Antetli PDF (şimdilik).
- Kesin en iyi (matematiksel optimum) paketleme garantisi.

## Anti-hedef

- Sığmayan bir yükü "sığar" diye göstermek. Yanlış olumlu, hiç plan üretmemekten kötüdür.
- Kullanıcının kuralını ihlal eden yerleşim: paletli yük üst üste olmamalı.
- Dosyalar/veriler cihazdan çıkan herhangi bir özellik.

## Kullanıcı kararları

- Yer: masaüstü uygulamasında kenar menüde ayrı bir "Konteyner planı" sayfası. Sevkiyat ve belgelerden bağımsız.
- Kalemler karışık: koli ve palet birlikte. Girdi elle, kalem kalem: ölçü, adet, paletli/paletsiz.
- Kurallar:
  - Paletli yük üst üste konmaz.
  - Paletsiz kutu konteyner tavanına kadar istiflenebilir.
  - Yön (döndürme) sorunun bir parçası: en uygun yön hesaplanır.
- Ağırlık sınırı kullanıcıyı ilgilendirmiyor.
- Çıktı: sekmeli tek çizim alanı (Tepeden / 3D / Katman katman), yükleme sırası numaralı, PDF olarak yazdırılabilir. (Taslak B seçildi.)
- Tasarım dili mevcut Auros teması (antrasit + `#00827c`).

## Yapım sırasında benim kararlarım (kullanıcı onayına açık)

- **Sezgisel yerleştirme:** 3D paketlemenin kesin çözümü zor olduğu için hızlı bir sezgisel yöntem (ör. katman/raf tabanlı veya uç nokta tabanlı) kullanılır. Ekranda sonucun "tahmini plan" olduğu belirtilir.
- **Konteyner iç ölçüleri (cm, yaklaşık):** 20' = 590 × 235 × 239; 40' = 1203 × 235 × 239; 40' HC = 1203 × 235 × 270. Kapı çerçevesi gibi ince ayrıntılar hesaba katılmaz.
- **Ölçü birimi:** cm ve kg. Giriş alanları buna göre.
- **Palet kalemi:** ölçüye palet yüksekliği dahil girilir. Yalnızca dik durur (yükseklik sabit), yatayda 90° döner.
- **Paletsiz kutu:** varsayılan olarak 6 yöne de dönebilir. Kalem başına "dik dursun" işareti ile yükseklik kilitlenir.
- **Paletli yükün üstüne hiçbir şey konmaz** (üstüne paletsiz kutu da konmaz); kullanıcının "üst üste konamaz" sözünü böyle yorumladım.
- **Sonuç gösterimi:** her konteyner tipi için o tipten kaç adet gerektiği ve bir konteynere neyin sığdığı gösterilir; birden fazla konteyner gerekiyorsa her biri ayrı çizimle. Seçilen tip üzerinden çizim sekmeleri değişir.
- **Hesap tarayıcıda/uygulamada yapılır;** ağır hesap arayüzü dondurmasın diye Web Worker tercih edilir (builder'a bırakıldı).
- **Taslak saklama:** girilen liste uygulama kapatılıp açılınca kaybolmaz (localStorage). Kayıtlı planlar/geçmiş yok.
- **PDF:** İngilizce, antetsiz; kalem listesi, konteyner tipi, doluluk, çizimler ve numaralı yükleme sırası. Mevcut `pdf-lib` ve IBM Plex Sans yaklaşımı kullanılır.
- **3D çizim:** dış kütüphane eklemeden (SVG/canvas izometrik) ya da yerel paketlenmiş küçük bir kütüphane; "vendor yerel" kuralı geçerli.

## Kullanıcı kararı: "en fazla kaç sığar" kipi

Sabit adetli liste kipine ek olarak, bir kalemin adedi boş ("olabildiğince çok") bırakılabilir. Bu kalem konteyner dolana kadar yerleştirilir ve sığan adet raporlanır. Diğer kalemler önce yerleştirilir, "olabildiğince çok" kalemi kalan boşluğu doldurur. (Kullanıcı: "evet olabilir"; birden fazla kalemde bu işaret kullanılırsa davranış builder'a bırakıldı, öneri: yalnızca bir kalemde izin ver.)

## İnceleme sonrası eklenen kararlarım

- **Konteyner tipleri bağımsız sonuçtur:** 20', 40' ve 40' HC için sonuçlar yan yana özetlenir; çizim sekmeleri seçilen tipe aittir. Birden fazla konteyner gerekirse kalemler yükleme sırasına göre ilk sığdığı konteynere konur (en az konteyner sayısı garanti edilmez); her konteyner ayrı çizilir.
- **Hiçbir konteynere sığmayacak kadar büyük kalem** "yerleştirilemez" diye işaretlenir, geri kalanlar planlanır. Yerleşemeyen kalemler nedeniyle birlikte listelenir ve sonuç "tahmini plan; yerleşmeyenler olabilir" notuyla gösterilir (sezgisel yöntem imkânsızlığı kanıtlayamaz).
- **Yükleme sırası fiziksel olarak uygulanabilir olmalı:** arka duvardan kapıya doğru doldurulur; istiflerde alttan üste yüklenir. Numara bu sırayı gösterir.
- **İstif desteği:** havada asılı kutu olmaz. Üstteki kutunun tabanı altındakilerce tamamen desteklenir (başlangıç kuralı; builder yüzde eşiğini ayarlayabilir, tahmin).
- **Boşluk payı:** varsayılan 0 cm; ayarlanabilir alan olarak bırakılır.
- **Ölçek:** yaklaşık 2000 birim ve 50 satıra kadar rahat çalışmalı; çizimde aynı kalemler gruplanarak yük azaltılır.

## Builder'a bırakılanlar

- Sezgisel algoritmanın seçimi ve ayarı, sığmayan kalemlerin raporlanma biçimi.
- Giriş formunun ayrıntıları (satır ekle/sil, çoğalt, içe/dışa liste kopyalama).
- 3D çizimin tekniği ve etkileşimi (döndürme/yakınlaştırma).
- Renk paleti ve kalem eşleştirme (aynı kalem aynı renk).
- Testler: bilinen örneklerle yerleşimin geçerliliğini (çakışma yok, sınır içinde, paletli üstü boş) denetleyen testler.

## Bilinen kısıtlar

- `desktop/` Vite + React; motor `assets/js/app/*` ile paylaşılıyor ve `@engine` alias'ı ile içe aktarılıyor. Planlayıcı kendi küçük modülü olabilir, motoru bozmamalı.
- Çeviriler `desktop/src/lib/strings.js` içinde; `node scripts/check-i18n.mjs` ile denetlenir.
- Yönlendirme `desktop/src/lib/router.js` (hash tabanlı), menü `Sidebar.jsx` içindeki `NAV`.
- Paketler imzasız, lisans/ödeme yok; bu özellik onlara dokunmaz.
