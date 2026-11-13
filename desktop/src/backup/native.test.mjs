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
  assert.equal(KEEP, 10);
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
