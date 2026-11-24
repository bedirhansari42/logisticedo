"use strict";
/* İndirilen paketi kurar. Windows: NSIS kurucusu sessiz, ayrık süreç. macOS: zip açılır, ayrık kabuk betiği
   uygulama çıkınca eski .app'i yedekleyip yenisini yerine koyar. Çağıran, başarıda app.quit() yapar. */
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

const WIN_ARGS = ["/S", "--force-run"];

const isPortable = (env) => !!(env && env.PORTABLE_EXECUTABLE_FILE);

/** …/X.app/Contents/MacOS/Y → …/X.app; .app yoksa null. */
function locateMacApp(execPath) {
  const i = String(execPath).indexOf(".app/Contents/MacOS/");
  return i < 0 ? null : execPath.slice(0, i + 4);
}

/** Yerinde değiştirmeye uygun mu: ok | translocated | dmg | readonly. */
function macTargetStatus(appPath, { fsApi = fs } = {}) {
  if (appPath.includes("/AppTranslocation/")) return "translocated";
  if (appPath.startsWith("/Volumes/")) return "dmg";
  try { fsApi.accessSync(path.dirname(appPath), fsApi.constants.W_OK); } catch { return "readonly"; }
  return "ok";
}

const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/** Ana süreç çıkana kadar bekler, eski .app'i yedekler, yenisini koyar (olmazsa yedeği geri alır), karantinayı kaldırır, açar. */
function buildMacSwapScript({ pid, target, source, backup, openCmd = "open" }) {
  const open = /^[\w./-]+$/.test(openCmd) ? openCmd : q(openCmd);
  return `#!/bin/sh
TARGET=${q(target)}
SOURCE=${q(source)}
BACKUP=${q(backup)}
while kill -0 ${Number(pid)} 2>/dev/null; do sleep 0.3; done
rm -rf "$BACKUP"
if mv "$TARGET" "$BACKUP" && ditto "$SOURCE" "$TARGET"; then
  xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null
else
  rm -rf "$TARGET"
  mv "$BACKUP" "$TARGET"
fi
${open} "$TARGET"
`;
}

const defaultRun = (cmd, args) => new Promise((ok, no) => execFile(cmd, args, (e, out) => (e ? no(e) : ok(String(out)))));

async function applyUpdate({ platform, file, execPath, pid, env = process.env, spawn, run = defaultRun, tmpDir, fsApi = fs }) {
  try {
    if (platform === "win32") {
      if (isPortable(env)) return { ok: false, reason: "portable" };
      spawn(file, WIN_ARGS, { detached: true, stdio: "ignore" }).unref();
      return { ok: true };
    }
    if (platform !== "darwin") return { ok: false, reason: "unknown" };
    const target = locateMacApp(execPath);
    if (!target || macTargetStatus(target, { fsApi }) !== "ok") return { ok: false, reason: "not_writable" };
    const dir = path.join(tmpDir, "extract");
    fsApi.rmSync(dir, { recursive: true, force: true });
    fsApi.mkdirSync(dir, { recursive: true });
    await run("ditto", ["-x", "-k", file, dir]);
    const app = fsApi.readdirSync(dir).find((n) => n.endsWith(".app"));
    if (!app) return { ok: false, reason: "unknown" };
    const source = path.join(dir, app);
    const exe = path.join(source, "Contents", "MacOS", path.basename(execPath));
    if (!fsApi.existsSync(exe)) return { ok: false, reason: "unknown" };
    const archs = String(await run("lipo", ["-archs", exe])).split(/\s+/);
    if (!archs.includes("x86_64") || !archs.includes("arm64")) return { ok: false, reason: "unknown" };
    const script = path.join(tmpDir, "swap.sh");
    fsApi.writeFileSync(script, buildMacSwapScript({ pid, target, source, backup: target + ".old" }), { mode: 0o700 });
    spawn("/bin/sh", [script], { detached: true, stdio: "ignore" }).unref();
    return { ok: true };
  } catch {
    return { ok: false, reason: "unknown" };
  }
}

/** Açılışta: önceki güncellemeden kalan .app.old yedeğini siler. */
function finishMacUpdate(execPath, { fsApi = fs } = {}) {
  try {
    const app = locateMacApp(execPath);
    if (app && fsApi.existsSync(app + ".old")) fsApi.rmSync(app + ".old", { recursive: true, force: true });
  } catch { /* yoksay */ }
}

module.exports = { isPortable, WIN_ARGS, locateMacApp, macTargetStatus, buildMacSwapScript, applyUpdate, finishMacUpdate };
