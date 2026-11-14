/* Proforma kayıtları için saf yardımcılar (motor/DOM bağımlılığı yok; node --test ile denenir). */

/** nos: en yeniden eskiye numaralar. İlk sondaki sayısı olan numarayı bir artırır (sıfır dolgusu korunur); yoksa "". */
export function nextProformaNo(nos) {
  for (const no of nos) {
    const m = String(no || "").match(/^(.*?)(\d+)$/);
    if (!m) continue;
    const next = String(BigInt(m[2]) + 1n).padStart(m[2].length, "0");
    return m[1] + next;
  }
  return "";
}
