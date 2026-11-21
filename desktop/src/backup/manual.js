/* Elle yedek: Ayarlar'daki "Yedek al" ve yedek hatırlatma penceresi bunu ortak kullanır.
   Masaüstünde "Farklı kaydet" penceresi açılır; tarayıcıda dosya indirilir. Hata olursa fırlatır (çağıran bildirir). */
import { toast } from "@common";
import { saveBlob } from "../lib/download.js";
import { exportBackup } from "./io.js";
import { getAuto, saveAuto } from "./auto.mjs";

/** @returns {Promise<"saved" | "cancelled">} */
export async function runManualBackup(t) {
  const json = JSON.stringify(await exportBackup());
  const name = `logisticedo-yedek-${new Date().toISOString().slice(0, 10)}.json`;
  const api = window.lgxBackup; // yalnızca masaüstü uygulamasında var
  if (api) {
    const r = await api.saveAs(json, name, getAuto().dir); // "Farklı kaydet": klasörü kullanıcı seçer
    if (!r) return "cancelled"; // vazgeçti
    const now = Date.now();
    saveAuto({ dir: r.dir, lastAt: now, lastTry: now, lastError: "", lastFile: r.path }); // klasör bundan sonra gösterilir ve otomatik yedekte kullanılır
    toast(t("d.bk.savedTo", { path: r.path }), "ok", 6000);
  } else {
    saveBlob(new Blob([json], { type: "application/json" }), name);
    toast(t("d.bk.exported"), "ok");
  }
  return "saved";
}
