# İlk açılış tanıtımı (tasarım)

Tarih: 2026-11-24. Kapsam: küçük özellik (masaüstü uygulaması).

## Amaç ve neden

Yeni kullanıcı uygulamayı ilk açtığında ne yapacağını bilsin. Önce kendi bilgilerini kursun (antet, şirket, banka), sonra diğer sayfalarda neler yapabileceğini görsün. Kullanıcı kullanım şartı: tanıtım sayfada gezmeyi engellememeli (kullanıcı adımı yaparken rehber yanında kalmalı).

## Hedefler

- Yeni kurulumda kısa bir karşılama penceresi (ortada), ardından köşede duran, sayfayı kilitlemeyen rehber kartı.
- Kart önce kurulum adımlarını gösterir: antet, şirket, banka. Adımlar veri eklenince kendiliğinden işaretlenir.
- Kurulum bitince (ya da atlanınca) kart sayfaları tek tek tanıtır: Proforma Faturalar, Sevkiyatlar, Konteyner planı, İthalat maliyeti, Notlar. Her kartta "Sayfaya git", Geri / İleri.
- Ayarlar'dan "Tanıtımı yeniden göster".
- Metinler TR ve EN, dil değişince tanıtım da değişir.

## Hedef dışı / istenmeyen

- Ekranı karartıp öğeyi vurgulayan (spotlight) tur yok.
- Zaten verisi olan kullanıcıya (güncelleme sonrası) tanıtım kendiliğinden açılmaz.
- Tanıtım hiçbir veri yazmaz, ağ isteği yapmaz.
- Silinen verilerden sonra tanıtım yeniden başlamaz (yalnızca Ayarlar'dan).

## Yaklaşımlar

1. **Karşılama penceresi + yüzen rehber kartı (seçildi).** Kart sayfayı kilitlemez; adım yapılırken görünür kalır.
2. Tek bir ortada slayt gösterisi (modal). Kullanıcı pencere açıkken sayfada hiçbir şey yapamaz; reddedildi.
3. Spotlight turu. Her sayfanın düzenine bağımlı ve kırılgan; reddedildi.

## Tasarım

- **Durum** (`localStorage` `lgx.tour`, `{status, page}`): `new` (hiç görülmedi) | `welcome` | `setup` | `pages` | `done`. Kapatılınca `done`; uygulama yeniden açılırsa kaldığı adımdan devam eder.
- **Başlangıç kararı:** durum `new` ise ve uygulama verileri yüklendiyse: hiç veri yoksa (sevkiyat, proforma, antet, şirket sayısı toplamı 0) `welcome`'a geçer; veri varsa sessizce `done` yapar.
- **Kurulum durumu** (saf): antet var mı (`letterheads.length>0`), şirket var mı (`companies.length>0`), banka var mı (herhangi bir şirkette `banks.length>0`). Banka satırı şirket yokken "Şirketler" sayfasına yönlendirir.
- **Karşılama:** ortada pencere, "Başla" / "Şimdi değil" (= kapat). Başka bir pencere açıksa (ör. güncelleme bildirimi) kapanana kadar bekler.
- **Rehber kartı:** sağ altta sabit, kilitlemez (`role="complementary"`). Kurulum kartı: üç satır (✓/○, "Aç" düğmesi), tamamlanınca "Hazırsınız" ve "Devam"; "Atla" ve kapat. Sayfa kartı: sayaç (n/5), başlık, kısa açıklama, "Sayfaya git", Geri / İleri (sonuncuda "Bitir"), kapat.
- **Ayarlar:** "Tanıtım" kartı, "Tanıtımı yeniden göster" → `welcome`.

## Builder'a bırakılanlar

Kart ve satır görünümü (mevcut tasarım diline uyar), simgeler, metinlerin son hâli (aşağıdaki sayfa listesine uygun kısa açıklamalar), CSS adları.

## Seçimler (benim)

- "Şimdi değil" tanıtımı kalıcı kapatır; geri açmak Ayarlar'dan.
- Veri silinince tanıtım geri gelmez.
- Depolama kullanılamazsa tanıtım her açılışta çıkabilir (kabul edilen küçük risk).
