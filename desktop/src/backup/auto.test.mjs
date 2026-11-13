import test from "node:test";
import assert from "node:assert/strict";

const store = {};
Object.defineProperty(globalThis, "localStorage", { value: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } }, configurable: true, writable: true });
const { defaultAuto, isDue, loadAuto, getAuto, saveAuto, subscribe, HOURS, AUTO_KEY } = await import("./auto.mjs");

const H = 3600000;
const cfg = (o) => ({ ...defaultAuto(), enabled: true, dir: "/b", hours: 6, lastAt: 0, ...o });

test("defaults: off, 6 hours, no folder", () => {
  assert.deepEqual(defaultAuto(), { enabled: false, hours: 6, dir: "", lastAt: 0, lastTry: 0, lastError: "", lastFile: "" });
  assert.ok(HOURS.includes(6));
});

test("isDue needs the switch on and a folder", () => {
  assert.equal(isDue(cfg({ enabled: false }), 100 * H), false);
  assert.equal(isDue(cfg({ dir: "" }), 100 * H), false);
  assert.equal(isDue(cfg(), 100 * H), true);
});

test("isDue waits for the interval after the last backup", () => {
  assert.equal(isDue(cfg({ lastAt: 10 * H }), 15 * H), false);
  assert.equal(isDue(cfg({ lastAt: 10 * H }), 16 * H), true);
  assert.equal(isDue(cfg({ hours: 1, lastAt: 10 * H }), 11 * H), true);
});

test("after a failure it retries after 10 minutes, not every minute", () => {
  const failed = cfg({ lastAt: 0, lastError: "x", lastTry: 100 * H });
  assert.equal(isDue(failed, 100 * H + 5 * 60000), false);
  assert.equal(isDue(failed, 100 * H + 10 * 60000), true);
});

test("loadAuto sanitizes stored junk", () => {
  store[AUTO_KEY] = JSON.stringify({ enabled: "yes", hours: 5, dir: 7, lastAt: "x" });
  assert.deepEqual(loadAuto(), defaultAuto());
  store[AUTO_KEY] = "{bad";
  assert.deepEqual(loadAuto(), defaultAuto());
  store[AUTO_KEY] = JSON.stringify({ enabled: true, hours: 12, dir: "/x", lastAt: 5, lastFile: "/x/f.json" });
  assert.deepEqual(loadAuto(), { ...defaultAuto(), enabled: true, hours: 12, dir: "/x", lastAt: 5, lastFile: "/x/f.json" });
});

test("saveAuto merges, persists, notifies and keeps the snapshot stable", () => {
  delete store[AUTO_KEY];
  let calls = 0;
  const off = subscribe(() => { calls++; });
  const a = getAuto();
  assert.equal(getAuto(), a); // aynı nesne: useSyncExternalStore döngüye girmez
  const b = saveAuto({ dir: "/y", enabled: true });
  assert.equal(calls, 1);
  assert.equal(getAuto(), b);
  assert.deepEqual(JSON.parse(store[AUTO_KEY]).dir, "/y");
  assert.equal(b.hours, 6);
  off();
  saveAuto({ hours: 1 });
  assert.equal(calls, 1);
});
