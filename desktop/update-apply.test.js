const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isPortable, WIN_ARGS, locateMacApp, macTargetStatus, buildMacSwapScript, applyUpdate, finishMacUpdate } = require("./update-apply.js");

const writable = { accessSync() {}, constants: { W_OK: 2 } };
const readonly = { accessSync() { throw new Error("EACCES"); }, constants: { W_OK: 2 } };
const EXEC = "/Applications/logisticedo.app/Contents/MacOS/logisticedo";

test("isPortable detects the portable build from its environment variable", () => {
  assert.equal(isPortable({ PORTABLE_EXECUTABLE_FILE: "C:\\x\\a.exe" }), true);
  assert.equal(isPortable({}), false);
});

test("locateMacApp finds the enclosing .app or returns null", () => {
  assert.equal(locateMacApp(EXEC), "/Applications/logisticedo.app");
  assert.equal(locateMacApp("/Users/a/My Apps/logisticedo.app/Contents/MacOS/logisticedo"), "/Users/a/My Apps/logisticedo.app");
  assert.equal(locateMacApp("/usr/local/bin/electron"), null);
});

test("macTargetStatus refuses translocated, DMG and unwritable locations", () => {
  assert.equal(macTargetStatus("/private/var/folders/x/AppTranslocation/y/d/logisticedo.app", { fsApi: writable }), "translocated");
  assert.equal(macTargetStatus("/Volumes/logisticedo/logisticedo.app", { fsApi: writable }), "dmg");
  assert.equal(macTargetStatus("/Applications/logisticedo.app", { fsApi: readonly }), "readonly");
  assert.equal(macTargetStatus("/Applications/logisticedo.app", { fsApi: writable }), "ok");
});

test("buildMacSwapScript waits for the process, backs up, swaps, clears quarantine, rolls back on failure and quotes paths", () => {
  const s = buildMacSwapScript({ pid: 4242, target: "/Users/a/My Apps/it's.app", source: "/tmp/x/new.app", backup: "/Users/a/My Apps/it's.app.old" });
  assert.match(s, /^#!\/bin\/sh/);
  assert.match(s, /kill -0 4242/);
  assert.ok(s.includes(`'/Users/a/My Apps/it'\\''s.app'`), "single quotes escaped");
  assert.match(s, /ditto/);
  assert.match(s, /xattr -dr com\.apple\.quarantine/);
  assert.match(s, /mv "\$TARGET" "\$BACKUP"/);
  assert.match(s, /else|\|\|/); // geri alma dalı
  assert.match(s, /\nopen /);
  assert.match(buildMacSwapScript({ pid: 1, target: "/a.app", source: "/b.app", backup: "/a.app.old", openCmd: "/bin/echo" }), /\n'?\/bin\/echo'? /);
});

test("applyUpdate on Windows runs the installer silently, detached; portable never installs", async () => {
  const calls = [];
  const spawn = (...a) => { calls.push(a); return { unref() {} }; };
  const ok = await applyUpdate({ platform: "win32", file: "C:\\t\\Setup.exe", env: {}, spawn });
  assert.deepEqual(ok, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "C:\\t\\Setup.exe");
  assert.deepEqual(calls[0][1], WIN_ARGS);
  assert.equal(calls[0][2].detached, true);
  const p = await applyUpdate({ platform: "win32", file: "x", env: { PORTABLE_EXECUTABLE_FILE: "a" }, spawn });
  assert.deepEqual(p, { ok: false, reason: "portable" });
  assert.equal(calls.length, 1);
});

test("applyUpdate on a Mac in a bad location changes nothing", async () => {
  const touched = [];
  const r = await applyUpdate({ platform: "darwin", file: "/t/a.zip", execPath: "/Volumes/x/logisticedo.app/Contents/MacOS/logisticedo", pid: 1, env: {}, tmpDir: "/t",
    spawn: () => touched.push("spawn"), run: async () => touched.push("run"), fsApi: writable });
  assert.deepEqual(r, { ok: false, reason: "not_writable" });
  assert.deepEqual(touched, []);
});

function macEnv({ archs = "x86_64 arm64", exeExists = true, apps = ["logisticedo.app"] } = {}) {
  const log = { run: [], spawn: [], files: {} };
  return { log, args: {
    platform: "darwin", file: "/t/a.zip", execPath: EXEC, pid: 99, env: {}, tmpDir: "/t",
    spawn: (...a) => { log.spawn.push(a); return { unref() {} }; },
    run: async (cmd, a) => { log.run.push([cmd, ...a]); return cmd === "lipo" ? archs + "\n" : ""; },
    fsApi: { ...writable, readdirSync: () => apps, existsSync: () => exeExists, mkdirSync() {}, writeFileSync: (p, c) => { log.files[p] = c; }, rmSync() {} }
  } };
}

test("applyUpdate on a Mac extracts, checks the binary and starts the swap script", async () => {
  const { log, args } = macEnv();
  assert.deepEqual(await applyUpdate(args), { ok: true });
  assert.deepEqual(log.run[0].slice(0, 3), ["ditto", "-x", "-k"]);
  assert.ok(log.run.some((c) => c[0] === "lipo"));
  assert.equal(log.spawn.length, 1);
  assert.equal(log.spawn[0][0], "/bin/sh");
  assert.equal(log.spawn[0][2].detached, true);
});

test("applyUpdate refuses a Mac package that is not universal, lacks the binary or the .app", async () => {
  for (const o of [{ archs: "arm64" }, { archs: "x86_64" }, { exeExists: false }, { apps: [] }]) {
    const { log, args } = macEnv(o);
    const r = await applyUpdate(args);
    assert.equal(r.ok, false, JSON.stringify(o));
    assert.equal(log.spawn.length, 0, JSON.stringify(o));
  }
});

test("finishMacUpdate removes the .old backup and never throws", () => {
  const removed = [];
  finishMacUpdate(EXEC, { fsApi: { existsSync: (p) => p.endsWith(".old"), rmSync: (p) => removed.push(p) } });
  assert.deepEqual(removed, ["/Applications/logisticedo.app.old"]);
  assert.doesNotThrow(() => finishMacUpdate(EXEC, { fsApi: { existsSync() { throw new Error("x"); } } }));
  assert.doesNotThrow(() => finishMacUpdate("/usr/bin/electron", { fsApi: {} }));
});
