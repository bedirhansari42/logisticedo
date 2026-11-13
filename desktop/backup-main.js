"use strict";
/* Yedekleme: ana süreç tarafı. Renderer yalnızca dar bir köprüyle (preload.js) üç iş isteyebilir:
   klasör seçtirmek, "Farklı kaydet" ile yedek yazmak, seçili klasöre otomatik yedek yazmak.
   Dosya adını otomatik yedekte ana süreç üretir; renderer yol ya da ad dayatamaz (klasör hariç, o da kullanıcının seçtiği yerdir). */
const fs = require("node:fs/promises");
const path = require("node:path");

const KEEP = 10; // otomatik yedeklerden en yeni 10'u saklanır
const AUTO_PATTERN = /^logisticedo-otomatik-yedek-\d{4}-\d{2}-\d{2}_\d{4}\.json$/;
const pad = (n) => String(n).padStart(2, "0");

function autoFileName(d = new Date()) {
  return `logisticedo-otomatik-yedek-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

/** Yalnızca kendi otomatik yedek dosyalarımızı siler; klasördeki başka dosyalara dokunmaz. */
async function rotate(dir, keep = KEEP) {
  const names = (await fs.readdir(dir)).filter((n) => AUTO_PATTERN.test(n)).sort();
  for (const n of names.slice(0, Math.max(0, names.length - keep))) await fs.rm(path.join(dir, n), { force: true });
}

async function writeAtomic(file, json) {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, json, "utf8");
  await fs.rename(tmp, file);
}

async function writeAuto(dir, json, now = new Date()) {
  if (typeof dir !== "string" || !path.isAbsolute(dir)) throw new Error("bad folder");
  if (typeof json !== "string" || json.length === 0) throw new Error("empty");
  if (!(await fs.stat(dir)).isDirectory()) throw new Error("not a folder");
  const file = path.join(dir, autoFileName(now));
  await writeAtomic(file, json);
  await rotate(dir);
  return file;
}

/** ctx: { dialog, ipcMain, getWindow, isTrusted(event), testDir } — electron'u çağıran yer verir (testlerde gerekmez). */
function register({ dialog, ipcMain, getWindow, isTrusted, testDir }) {
  const guard = (fn) => async (event, arg) => {
    if (!isTrusted(event)) throw new Error("untrusted sender");
    return fn(arg || {});
  };
  // Test kipinde pencere açılmaz: seçimler testDir altına yönlenir
  const testFolder = async () => { const d = path.join(testDir, "backup-folder"); await fs.mkdir(d, { recursive: true }); return d; };

  ipcMain.handle("lgx:backup:choose-folder", guard(async ({ defaultPath }) => {
    if (testDir) return testFolder();
    const r = await dialog.showOpenDialog(getWindow(), { properties: ["openDirectory", "createDirectory"], defaultPath: typeof defaultPath === "string" && defaultPath ? defaultPath : undefined });
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
  }));

  ipcMain.handle("lgx:backup:save-as", guard(async ({ json, name, dir }) => {
    if (typeof json !== "string" || !json) throw new Error("empty");
    const base = path.basename(typeof name === "string" && name ? name : "logisticedo-yedek.json");
    let file;
    if (testDir) file = path.join(await testFolder(), base);
    else {
      const start = typeof dir === "string" && path.isAbsolute(dir) ? path.join(dir, base) : base;
      const r = await dialog.showSaveDialog(getWindow(), { defaultPath: start, filters: [{ name: "logisticedo backup", extensions: ["json"] }] });
      if (r.canceled || !r.filePath) return null;
      file = r.filePath;
    }
    await writeAtomic(file, json);
    return { path: file, dir: path.dirname(file) };
  }));

  ipcMain.handle("lgx:backup:write-auto", guard(async ({ dir, json }) => {
    try { return { path: await writeAuto(dir, json) }; } catch (e) { return { error: e?.message || String(e) }; }
  }));
}

module.exports = { autoFileName, rotate, writeAuto, register, KEEP, AUTO_PATTERN };
