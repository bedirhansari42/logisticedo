# Packing List by Pallet: elle C/No. — kısa tasarım (2026-11-27)

## Neden
Koli numaraları gerçekte otomatik sayımdan farklı olabilir (ör. 101'den başlar). Kullanıcı C/No.'yu satır satır elle girebilmeli.

## Tasarım (onaylandı)
- Palet satırına `cno` (serbest metin, varsayılan ""). `newPalletLine` ve `normalizePallets` taşır; eski kayıt/yedekte boş.
- Boşsa otomatik numara: masaüstünde yer tutucu (gri), PDF'e basılır. Doluysa yazıldığı gibi basılır.
- Sayım: paletler boyunca satır sırasıyla. Elle yazılan değer bir sayıyla bitiyorsa ("101-105") sayaç o sayıya ayarlanır, sonraki boş satırlar oradan devam eder (106-108). Sayıyla bitmiyorsa sayaç koli sayısı kadar ilerler.
- `cartonNumbers(s)` → `Map<satır id, { value, suggested }>` (lineQty/palletWeight ile aynı biçim).
- PDF: C/No. sütunu koli sayısı varsa ya da herhangi bir satırda elle C/No. varsa görünür.
- Sahipsiz satırlar numaralanmaz (bugünkü gibi).

## Yaklaşımlar
- **Satırda isteğe bağlı elle değer + otomatik öneri — SEÇİLDİ** (sayfanın miktar/ağırlık deseniyle aynı).
- Otomatik numarayı tamamen kaldırmak: elendi, çoğu kullanıcı için ek iş.
- Yalnız "başlangıç numarası" alanı: elendi, atlamalı/harfli numaraları karşılamaz.

## Hedef dışı
- Statik site eski palet ekranı (motor değişikliği orada da öneri olarak çalışır, alan eklenmez).
- Etiketler (C/No. kullanmıyor).
