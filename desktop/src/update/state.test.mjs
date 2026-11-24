import test from "node:test";
import assert from "node:assert/strict";
import { isEnabled, setEnabled, loadSkipped, skipVersion, shouldNotify, ENABLED_KEY, SKIP_KEY } from "./state.mjs";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
const reset = () => mem.clear();

test("update checks are on by default", () => {
  reset();
  assert.equal(isEnabled(), true);
});

test("setEnabled(false) turns checks off and setEnabled(true) back on", () => {
  reset();
  setEnabled(false);
  assert.equal(mem.get(ENABLED_KEY), "0");
  assert.equal(isEnabled(), false);
  setEnabled(true);
  assert.equal(isEnabled(), true);
});

test("a broken localStorage never throws and keeps checks on", () => {
  const saved = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  try {
    assert.equal(isEnabled(), true);
    assert.doesNotThrow(() => setEnabled(false));
    assert.equal(loadSkipped(), "");
    assert.doesNotThrow(() => skipVersion("1.2.0"));
  } finally { globalThis.localStorage = saved; }
});

test("skipVersion stores the normalized version", () => {
  reset();
  assert.equal(loadSkipped(), "");
  skipVersion("v1.2.0");
  assert.equal(mem.get(SKIP_KEY), "1.2.0");
  assert.equal(loadSkipped(), "1.2.0");
});

const base = { latest: "v1.2.0", current: "1.1.0", skipped: "", dismissed: "" };

test("shouldNotify is true for a newer release nobody dismissed", () => {
  assert.equal(shouldNotify(base), true);
});

test("a skipped version stays quiet, but a newer one after it is offered again", () => {
  assert.equal(shouldNotify({ ...base, skipped: "1.2.0" }), false);
  assert.equal(shouldNotify({ ...base, latest: "v1.3.0", skipped: "1.2.0" }), true);
});

test("'Later' (dismissed this session) hides only that version", () => {
  assert.equal(shouldNotify({ ...base, dismissed: "1.2.0" }), false);
  assert.equal(shouldNotify({ ...base, latest: "v1.3.0", dismissed: "1.2.0" }), true);
});

test("shouldNotify is false when latest is older, equal or unparsable", () => {
  assert.equal(shouldNotify({ ...base, latest: "v1.0.0" }), false);
  assert.equal(shouldNotify({ ...base, latest: "v1.1.0" }), false);
  assert.equal(shouldNotify({ ...base, latest: "latest" }), false);
});
