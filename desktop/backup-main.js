"use strict";
/* Yedekleme: ana süreç tarafı. Renderer yalnızca dar bir köprüyle (preload.js) üç iş isteyebilir:
   klasör seçtirmek, "Farklı kaydet" ile yedek yazmak, seçili klasöre otomatik yedek yazmak.
   Dosya adını otomatik yedekte ana süreç üretir; renderer yol ya da ad dayatamaz (klasör hariç, o da kullanıcının seçtiği yerdir). */
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const FOLDER_NOT_CHOSEN = "folder-not-chosen"; // arayüz bu kodu çevirir (d.bk.err.folder)
const KEEP = 5; // otomatik yedeklerden en yeni 5'i saklanır
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

/** Rastgele adlı geçici dosyaya yalnızca-sahibi (0600) ve "wx" (var olan dosya / sembolik bağ izlenmez) ile yazar, sonra yerine taşır. */
async function writeAtomic(file, json) {
  const tmp = `${file}.tmp-${crypto.randomBytes(6).toString("hex")}`;
  await fs.writeFile(tmp, json, { encoding: "utf8", flag: "wx", mode: 0o600 });
  try {
    await fs.rename(tmp, file);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
}

/** Otomatik yedeğin yazabileceği klasörler: yalnızca kullanıcının pencereden seçtikleri (ana süreçte, userData'da saklanır).
    Geçiş: kayıt dosyası hiç yoksa (önceki sürümden gelen kullanıcı) ilk istenen klasör bir kez benimsenir. */
function createFolderStore(file) {
  let dirs = null; // Set; null = henüz okunmadı
  let fresh = false; // dosya hiç yoktu
  const norm = (d) => (typeof d === "string" && path.isAbsolute(d) ? path.resolve(d) : null);
  async function load() {
    if (dirs) return;
    try {
      const raw = JSON.parse(await fs.readFile(file, "utf8"));
      dirs = new Set(Array.isArray(raw?.dirs) ? raw.dirs.map(norm).filter(Boolean) : []);
    } catch (e) {
      fresh = e?.code === "ENOENT";
      dirs = new Set();
    }
  }
  const save = () => writeAtomic(file, JSON.stringify({ dirs: [...dirs] }));
  return {
    async add(dir) {
      const d = norm(dir);
      if (!d) return;
      await load();
      fresh = false;
      if (!dirs.has(d)) { dirs.add(d); await save(); }
    },
    async allows(dir) {
      const d = norm(dir);
      if (!d) return false;
      await load();
      if (dirs.has(d)) return true;
      if (!fresh) return false;
      fresh = false;
      dirs.add(d);
      await save();
      return true;
    }
  };
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

/** ctx: { dialog, ipcMain, getWindow, isTrusted(event), testDir, folders } — electron'u çağıran yer verir (testlerde gerekmez).
    folders: createFolderStore(...) — otomatik yedeğin yazabileceği klasörler. */
function register({ dialog, ipcMain, getWindow, isTrusted, testDir, folders }) {
  const guard = (fn) => async (event, arg) => {
    if (!isTrusted(event)) throw new Error("untrusted sender");
    return fn(arg || {});
  };
  // Test kipinde pencere açılmaz: seçimler testDir altına yönlenir
  const testFolder = async () => { const d = path.join(testDir, "backup-folder"); await fs.mkdir(d, { recursive: true }); await folders.add(d); return d; };

  ipcMain.handle("lgx:backup:choose-folder", guard(async ({ defaultPath }) => {
    if (testDir) return testFolder();
    const r = await dialog.showOpenDialog(getWindow(), { properties: ["openDirectory", "createDirectory"], defaultPath: typeof defaultPath === "string" && defaultPath ? defaultPath : undefined });
    if (r.canceled || !r.filePaths[0]) return null;
    await folders.add(r.filePaths[0]);
    return r.filePaths[0];
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
      await folders.add(path.dirname(file)); // "Yedek al" ile seçilen klasör otomatik yedek klasörü de olur
    }
    await writeAtomic(file, json);
    return { path: file, dir: path.dirname(file) };
  }));

  ipcMain.handle("lgx:backup:write-auto", guard(async ({ dir, json }) => {
    try {
      if (!(await folders.allows(dir))) return { error: FOLDER_NOT_CHOSEN };
      return { path: await writeAuto(dir, json) };
    } catch (e) { return { error: e?.message || String(e) }; }
  }));
}

module.exports = { autoFileName, rotate, writeAuto, writeAtomic, createFolderStore, register, KEEP, AUTO_PATTERN };
