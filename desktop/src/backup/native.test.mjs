import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const { autoFileName, rotate, writeAuto, AUTO_PATTERN, KEEP } = createRequire(import.meta.url)("../../backup-main.js");
const tmp = () => mkdtempSync(path.join(tmpdir(), "lgx-bk-"));

test("auto file names are local-time stamped and match the pattern", () => {
  const name = autoFileName(new Date(2026, 10, 13, 15, 7));
  assert.equal(name, "logisticedo-otomatik-yedek-2026-11-13_1507.json");
  assert.ok(AUTO_PATTERN.test(name));
});

test("rotate keeps the newest N own files and never touches other files", async () => {
  const dir = tmp();
  for (let i = 1; i <= 5; i++) writeFileSync(path.join(dir, autoFileName(new Date(2026, 0, i, 10, 0))), "x");
  writeFileSync(path.join(dir, "logisticedo-yedek-2026-01-01.json"), "manual");
  writeFileSync(path.join(dir, "notes.txt"), "mine");
  await rotate(dir, 2);
  assert.deepEqual(readdirSync(dir).sort(), ["logisticedo-otomatik-yedek-2026-01-04_1000.json", "logisticedo-otomatik-yedek-2026-01-05_1000.json", "logisticedo-yedek-2026-01-01.json", "notes.txt"]);
  assert.equal(KEEP, 5);
});

test("writeAuto keeps only the newest 5 automatic backups by default", async () => {
  const dir = tmp();
  for (let i = 1; i <= 8; i++) await writeAuto(dir, '{"a":' + i + '}', new Date(2026, 10, 13, 9, i));
  const names = readdirSync(dir).sort();
  assert.equal(names.length, 5);
  assert.equal(names[0], "logisticedo-otomatik-yedek-2026-11-13_0904.json");
  assert.equal(names[4], "logisticedo-otomatik-yedek-2026-11-13_0908.json");
});

test("writeAuto writes the file atomically and returns its path", async () => {
  const dir = tmp();
  const file = await writeAuto(dir, '{"a":1}', new Date(2026, 10, 13, 9, 30));
  assert.equal(file, path.join(dir, "logisticedo-otomatik-yedek-2026-11-13_0930.json"));
  assert.equal(readFileSync(file, "utf8"), '{"a":1}');
  assert.deepEqual(readdirSync(dir), ["logisticedo-otomatik-yedek-2026-11-13_0930.json"]); // .tmp kalmadı
});

test("writeAuto rejects relative paths, missing folders, files and empty data", async () => {
  const dir = tmp();
  await assert.rejects(() => writeAuto("relative/dir", "{}"), /folder/);
  await assert.rejects(() => writeAuto(path.join(dir, "nope"), "{}"));
  const f = path.join(dir, "file.txt"); writeFileSync(f, "x");
  await assert.rejects(() => writeAuto(f, "{}"));
  await assert.rejects(() => writeAuto(dir, ""), /empty/);
  await assert.rejects(() => writeAuto(dir, 42), /empty/);
  mkdirSync(path.join(dir, "ok"));
  assert.ok(await writeAuto(path.join(dir, "ok"), "{}"));
});

// ---- Klasör hafızası ve güvenli atomik yazma (güvenlik run-2 sertleştirme) ----
const { createFolderStore, writeAtomic } = createRequire(import.meta.url)("../../backup-main.js");
import { statSync, symlinkSync, existsSync } from "node:fs";

test("folder store: first use adopts the existing folder once (migration), later only chosen folders", async () => {
  const d = tmp();
  const a = path.join(d, "a"), b = path.join(d, "b");
  mkdirSync(a); mkdirSync(b);
  const file = path.join(d, "backup-folders.json");
  const s = createFolderStore(file);
  assert.equal(await s.allows(a), true); // dosya yok: eski kullanıcının klasörü bir kez benimsenir
  assert.equal(await s.allows(b), false);
  const s2 = createFolderStore(file); // yeniden açılışta kalıcı
  assert.equal(await s2.allows(a), true);
  assert.equal(await s2.allows(b), false);
  await s2.add(b);
  assert.equal(await createFolderStore(file).allows(b), true);
});

test("folder store: a corrupt store file adopts nothing", async () => {
  const d = tmp();
  const file = path.join(d, "backup-folders.json");
  writeFileSync(file, "{oops");
  assert.equal(await createFolderStore(file).allows(d), false);
});

test("folder store: paths are compared after normalising", async () => {
  const d = tmp();
  const s = createFolderStore(path.join(d, "f.json"));
  await s.add(d);
  assert.equal(await s.allows(d + path.sep), true);
  assert.equal(await s.allows(path.join(d, "x", "..")), true);
  assert.equal(await s.allows("relative"), false);
});

test("writeAtomic: owner-only mode, random temp name, does not follow a planted temp symlink", async () => {
  const d = tmp();
  const target = path.join(d, "out.json");
  const victim = path.join(d, "victim.txt");
  writeFileSync(victim, "keep");
  symlinkSync(victim, target + ".tmp"); // eski sabit geçici ad
  await writeAtomic(target, "{}");
  assert.equal(readFileSync(target, "utf8"), "{}");
  assert.equal(readFileSync(victim, "utf8"), "keep");
  if (process.platform !== "win32") assert.equal(statSync(target).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(d).filter((n) => n.includes(".tmp-")), []);
});

test("writeAtomic: the temp file is removed when the rename fails", async () => {
  const d = tmp();
  const target = path.join(d, "dir-in-the-way");
  mkdirSync(target);
  writeFileSync(path.join(target, "x"), "x"); // dolu klasörün üzerine dosya taşınamaz
  await assert.rejects(() => writeAtomic(target, "{}"));
  assert.deepEqual(readdirSync(d), ["dir-in-the-way"]);
});
