import test from "node:test";
import assert from "node:assert/strict";
import { TOUR_KEY, getTour, subscribeTour, tourEvent, setTourState } from "./store.mjs";

const mem = new Map();
const fake = () => ({ getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) });
globalThis.localStorage = fake();

test("an empty store reads as a brand-new install", () => {
  mem.clear();
  assert.deepEqual(getTour(), { status: "new", page: 0 });
});

test("setTourState persists JSON and getTour returns the same state", () => {
  mem.clear();
  setTourState({ status: "setup", page: 0 });
  assert.deepEqual(JSON.parse(mem.get(TOUR_KEY)), { status: "setup", page: 0 });
  assert.deepEqual(getTour(), { status: "setup", page: 0 });
});

test("getTour returns a stable object while nothing changed (useSyncExternalStore needs that)", () => {
  mem.clear();
  setTourState({ status: "pages", page: 2 });
  assert.equal(getTour(), getTour());
});

test("tourEvent applies the transition, saves it and notifies subscribers once", () => {
  mem.clear();
  setTourState({ status: "setup", page: 0 });
  let calls = 0;
  const off = subscribeTour(() => { calls++; });
  tourEvent("close");
  assert.equal(getTour().status, "done");
  assert.equal(calls, 1);
  off();
  tourEvent("restart");
  assert.equal(calls, 1);
  assert.equal(getTour().status, "welcome");
});

test("an event that does not fit the state changes and notifies nothing", () => {
  mem.clear();
  setTourState({ status: "done", page: 0 });
  let calls = 0;
  const off = subscribeTour(() => { calls++; });
  tourEvent("next");
  off();
  assert.equal(calls, 0);
  assert.equal(getTour().status, "done");
});

test("a corrupt saved value reads as new", () => {
  mem.clear();
  mem.set(TOUR_KEY, "{not json");
  assert.equal(getTour().status, "new");
});

test("a localStorage that throws never throws; the tour keeps working in memory", () => {
  const boom = () => { throw new Error("blocked"); };
  globalThis.localStorage = { getItem: boom, setItem: boom, removeItem: boom };
  try {
    assert.doesNotThrow(() => getTour());
    setTourState({ status: "welcome", page: 0 });
    assert.equal(getTour().status, "welcome");
    assert.doesNotThrow(() => tourEvent("start"));
    assert.equal(getTour().status, "setup");
  } finally { globalThis.localStorage = fake(); }
});
