/* Otomatik yedek zamanlayıcı: uygulama açıkken dakikada bir "zamanı geldi mi" diye bakar ve seçili klasöre yazar. */
import { useEffect } from "react";
import { exportBackup } from "./io.js";
import { getAuto, saveAuto, isDue } from "./auto.mjs";

let running = false;

export async function runAutoBackup() {
  const api = window.lgxBackup;
  if (!api || running || !isDue(getAuto())) return;
  running = true;
  const now = Date.now();
  try {
    const r = await api.writeAuto(getAuto().dir, JSON.stringify(await exportBackup()));
    if (r?.path) saveAuto({ lastAt: now, lastTry: now, lastError: "", lastFile: r.path });
    else saveAuto({ lastTry: now, lastError: r?.error || "unknown error" });
  } catch (e) {
    saveAuto({ lastTry: now, lastError: e?.message || String(e) });
  } finally {
    running = false;
  }
}

export function useAutoBackup() {
  useEffect(() => {
    runAutoBackup(); // açılışta zamanı gelmişse hemen
    const id = setInterval(runAutoBackup, 60 * 1000);
    return () => clearInterval(id);
  }, []);
}
