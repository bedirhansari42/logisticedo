/* Free of Charge (ücretsiz) sevkiyat: saf yardımcılar (içe aktarma yok; motor ve masaüstü ikisi de kullanır). */

export const FOC_REASONS = ["SAMPLE", "REPLACEMENT", "WARRANTY", "GIFT", "RETURN", "OTHER"];

/** Belgede basılan gönderim nedeni: büyük harf; OTHER ise serbest metin (boşsa "OTHER"); boş/bilinmeyen neden SAMPLE */
export function focReasonText(foc) {
  const reason = String(foc?.reason || "").toUpperCase();
  if (reason === "OTHER") return String(foc?.reasonOther || "").trim().toUpperCase() || "OTHER";
  return FOC_REASONS.includes(reason) ? reason : "SAMPLE";
}
