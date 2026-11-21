import test from "node:test";
import assert from "node:assert/strict";

const store = {};
Object.defineProperty(globalThis, "localStorage", { value: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } }, configurable: true, writable: true });
const { needsReminder, loadSnooze, snooze, clearSnooze, ago, REMIND_AFTER_MS, SNOOZE_MS, REMIND_KEY } = await import("./reminder.mjs");

const H = 3600000;
const MIN = 60000;
const NOW = 1000 * H;
const base = (o) => ({ lastAt: NOW - 30 * H, snoozedUntil: 0, hasData: true, now: NOW, ...o });

test("constants: 24 hours, 1 hour, storage key", () => {
  assert.equal(REMIND_AFTER_MS, 24 * H);
  assert.equal(SNOOZE_MS, H);
  assert.equal(REMIND_KEY, "lgx.backupRemind");
});

test("no data (empty install) never reminds", () => {
  assert.equal(needsReminder(base({ hasData: false })), false);
  assert.equal(needsReminder(base({ hasData: false, lastAt: 0 })), false);
});

test("never backed up (lastAt 0) with data reminds", () => {
  assert.equal(needsReminder(base({ lastAt: 0 })), true);
});

test("24 hour boundary: 1 ms short does not, exactly 24h does", () => {
  assert.equal(needsReminder(base({ lastAt: NOW - 24 * H + 1 })), false);
  assert.equal(needsReminder(base({ lastAt: NOW - 24 * H })), true);
});

test("snooze: active snooze hides, expired snooze shows", () => {
  assert.equal(needsReminder(base({ snoozedUntil: NOW + 30 * MIN })), false);
  assert.equal(needsReminder(base({ snoozedUntil: NOW - 1 })), true);
});

test("clock set back: lastAt more than 5 min in the future counts as due", () => {
  assert.equal(needsReminder(base({ lastAt: NOW + 10 * MIN })), true);
  assert.equal(needsReminder(base({ lastAt: NOW + 2 * MIN })), false);
});

test("clock moved: a snooze longer than one hour ahead is ignored", () => {
  assert.equal(needsReminder(base({ snoozedUntil: NOW + 5 * H })), true);
});

test("loadSnooze: empty or garbage storage gives 0", () => {
  delete store[REMIND_KEY];
  assert.equal(loadSnooze(), 0);
  for (const bad of ["abc", "-5", "NaN", "Infinity", ""]) { store[REMIND_KEY] = bad; assert.equal(loadSnooze(), 0, bad); }
});

test("snooze() stores now + 1 hour; clearSnooze() removes it", () => {
  assert.equal(snooze(1000), 1000 + SNOOZE_MS);
  assert.equal(loadSnooze(), 1000 + SNOOZE_MS);
  clearSnooze();
  assert.equal(loadSnooze(), 0);
});

test("ago: hours under 48h, days from 48h", () => {
  assert.deepEqual(ago(NOW - 25 * H, NOW), { unit: "h", n: 25 });
  assert.deepEqual(ago(NOW - Math.round(47.9 * H), NOW), { unit: "h", n: 47 });
  assert.deepEqual(ago(NOW - 72 * H, NOW), { unit: "d", n: 3 });
});
