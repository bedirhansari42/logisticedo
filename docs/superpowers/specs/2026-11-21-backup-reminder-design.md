# Yedek hatırlatma penceresi — tasarım (2026-11-21)

Onay: kullanıcı konuşmada onayladı (küçük değişiklik, kısa tasarım).

## Amaç
Veriler yalnızca bu bilgisayarda (IndexedDB) durur. Son yedek 24 saatten eskiyse, kullanıcı hangi sayfada olursa olsun bir pop up ile yedek alması hatırlatılır.

## Hedefler / hedef olmayanlar
- Hedef: otomatik ya da elle son yedekten 24 saat geçince uyarmak; otomatik yedek bozuksa da uyarmak.
- Hedef değil: otomatik yedeği zorla açmak, yedek içeriğini ya da formatını değiştirmek, sunucuya bir şey göndermek.
- Kötü sonuç: boş kurulumda ya da yedek düzenli çalışırken rahatsız etmek; kullanıcıyı sürekli kesmek.

## Mevcut durum (yeniden kullanılır)
- `src/backup/auto.mjs`: `lastAt` (son başarılı yedek, elle ya da otomatik) localStorage `lgx.autobackup` içinde.
- `src/backup/scheduler.js`: açılışta ve dakikada bir çalışan `useAutoBackup()` (App.jsx).
- `pages/Settings.jsx` `doExport`: "Farklı kaydet" ile elle yedek, `lastAt` günceller.
- `components/ConfirmHost.jsx`: `.dialog` görünümü.

## Yaklaşımlar
1. **Ayrı hatırlatma bileşeni + saf karar fonksiyonu (seçildi).** `reminder.mjs` karar verir, `BackupReminder.jsx` çizer; mevcut yedek koduna dokunmadan `lastAt`'i okur.
2. `askConfirm` ile göstermek: yalnızca iki düğme ve tek mesaj; "son yedek zamanı" ve ortak yedek eylemi için esnek değil, elendi.
3. Otomatik yedeği varsayılan açmak: kullanıcı klasör seçmeden çalışmaz ve istenen şey bu değil, elendi.

## Tasarım
- **Tetik** (`needsReminder({ lastAt, snoozedUntil, hasData, now })`, saf, testli): `hasData` yoksa hayır; `snoozedUntil > now` ise hayır; `lastAt` yoksa ya da `now - lastAt >= 24 saat` ise evet.
- **hasData:** kayıtlı sevkiyat, proforma ya da antet var mı (`collectSnapshot` ya da store listeleri). Boş kurulumda uyarmaz.
- **Zamanlama:** `useBackupReminder()` açılışta (kısa gecikmeyle) ve dakikada bir kontrol eder; aynı anda tek pencere.
- **Pencere:** `.dialog` görünümünde modal. "Son yedek: …" ya da "Hiç yedek alınmadı". Düğmeler: **Şimdi yedekle** (Ayarlar'daki elle yedekle aynı işi yapar; `doExport` ortak bir modüle çıkarılır; başarıda `lastAt` güncellenir, pencere kapanır, toast), **Sonra hatırlat** (1 saat ertele).
- **Erteleme:** `snoozedUntil` localStorage'da (`lgx.backupRemind`), bilgisayara özgü; uygulamayı yeniden açmak sayacı sıfırlamaz. Yedek alınınca silinir.
- **Hata:** yedek yazılamazsa pencere açık kalır, hata toast'ı gösterilir.
- **Dil:** TR/EN metinler `lib/strings.js`; `node scripts/check-i18n.mjs` ile denetlenir.
- **Test:** `reminder.test.mjs` (24 saat sınırı, hiç yedek yok, boş veri, erteleme, saat geri alma).

## Builder'a bırakılanlar
Dosya adları, CSS ayrıntıları, kontrol gecikmesi, "n gün/saat önce" biçimlendirmesi.
