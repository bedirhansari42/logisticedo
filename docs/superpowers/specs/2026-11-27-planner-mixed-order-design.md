# Konteyner planı: kalemleri karışık dizme — kısa tasarım (2026-11-27)

## Neden
Kullanıcı: "aynı kalem türü yan yana durunca yeteri kadar istif yapamıyorum." Ölçüm: bugünkü sıra (önce yalnız-zemin paletler, sonra ayak izi büyük olanlar; kalem kalem) 60 rastgele 40' yükünün 33'ünde ilk konteynerleri daha boş bırakıyor, 3'ünde fazladan konteyner açıyor (ör. istiflenemeyen 56 palet ilk konteynerin tabanını tek başına kaplayıp %21 dolulukla gidiyor).

## Yaklaşım (kullanıcı seçti: A)
- **A) Birkaç diziliş sırası dene, en iyisini seç — SEÇİLDİ.** Bugünkü sıra adaylardan biri → sonuç hiçbir zaman bugünkünden kötü değil; deterministik.
- B) Birim birim en iyi yeri seçen yeni yerleştirici — elendi (büyük yeniden yazım, gerileme riski, yavaş).
- C) Rastgele denemeler — elendi (deterministik değil, yavaş).

## Tasarım
- `planOnce(items, key, { order })`, `order` ∈ `group` (bugünkü, varsayılan) | `volume` (birim hacmi büyükten küçüğe, kalem kalem) | `height` (yükseklik büyükten küçüğe; silindirde çap).
- Uygulama sırasında karar: birer birer dönüşümlü `mix` sırası denendi ve çıkarıldı — 240 rastgele yükün 13'ünde az farkla kazandı, hiç konteyner kazandırmadı, hesabı ~10 kat uzattı.
- Bir birimin bir konteynere sığmadığı bilgisi, o konteynere sonradan başka bir şey konunca geçersiz olur (yeni üst yüzey istif yeri açabilir): konteyner başına sürüm sayacı.
- `planLoad`: önce bugünkü gibi silindir adaylarından en iyisi (`group` sırasıyla), sonra o aday listesiyle öteki iki sıra denenir. En çok 6 + 2 çalıştırma.
- Seçim ölçütü sırayla: sığmayan birim en az → konteyner sayısı en az → dolgu (fill) kalemi en çok → konteyner hacimleri sırayla en dolu (ilk konteyner en dolu). Eşitlikte ilk aday (`group`) kalır: düzenli boşaltma.
- Yalnız-zemin, istiflenemez, kapıya doğru engel yok kuralları değişmez.

## Hedef dışı
- Ağırlık dağılımı / denge, yükleme sırası (boşaltma limanı) gruplaması.
