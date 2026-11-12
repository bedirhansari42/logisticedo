// macOS, `npm start` ile çalışırken menü çubuğundaki uygulama adını Electron paketinin Info.plist'inden alır ("Electron").
// Bu betik yalnızca geliştirme için node_modules içindeki Electron kopyasının adını "logisticedo" yapar.
// Paketlenmiş uygulamayı etkilemez (electron-builder kendi Electron kopyasını kullanır). Geri almak için: node scripts/dev-name.mjs --restore
import { copyFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

if (process.platform !== "darwin") process.exit(0);
const plist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../node_modules/electron/dist/Electron.app/Contents/Info.plist");
if (!existsSync(plist)) process.exit(0);
const backup = plist + ".orig";
const set = (key, value) => execFileSync("plutil", ["-replace", key, "-string", value, plist]);

if (process.argv.includes("--restore")) {
  if (existsSync(backup)) { copyFileSync(backup, plist); console.log("Electron adı geri yüklendi."); }
} else {
  if (!existsSync(backup)) copyFileSync(plist, backup);
  set("CFBundleName", "logisticedo");
  set("CFBundleDisplayName", "logisticedo");
}
