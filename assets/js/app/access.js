/* Erişim ayarları. Ödeme sistemi eklenince yalnızca bu dosya değişecek.

   WATERMARK_PREVIEW: true ise ücretsiz kullanıcının önizlemesine (yan panel ve büyük pencere) soluk
   bir filigran çizilir. Filigran yalnızca ekrandaki görüntüdedir; indirilen PDF'e girmez.
   TEST AŞAMASINDA KAPALI. Yayına çıkarken true yapın. */
export const WATERMARK_PREVIEW = false;

/** Kullanıcının ücretli hakkı var mı? Şimdilik herkes için evet (ödeme sistemi sonra bağlanacak). */
export function isPaid() {
  return true;
}

/** Önizlemeye filigran çizilsin mi? */
export function previewWatermark() {
  return WATERMARK_PREVIEW && !isPaid();
}

/** İndirmeye izin var mı? (ödeme aşamasında sunucu doğrulamasına bağlanacak) */
export function canDownload() {
  return true;
}
