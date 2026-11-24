import test from "node:test";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.window = {};
const { checkForUpdate, openRelease, updateApi } = await import("./api.mjs");
const { setEnabled } = await import("./state.mjs");

const REL = "https://github.com/bedirhansari42/logisticedo/releases/tag/v1.1.0";
function bridge(result) {
  const calls = { check: 0, open: [] };
  globalThis.window.lgxUpdate = {
    version: async () => "1.0.0",
    check: async () => { calls.check++; if (result instanceof Error) throw result; return result; },
    open: async (u) => { calls.open.push(u); return u === REL; }
  };
  return calls;
}
const res = (tag, extra = {}) => ({ current: "1.0.0", latest: { tag, url: REL }, error: false, ...extra });
const reset = () => { mem.clear(); delete globalThis.window.lgxUpdate; };

test("without the desktop bridge nothing is available and updateApi is null", async () => {
  reset();
  assert.equal(updateApi(), null);
  assert.equal((await checkForUpdate()).status, "unavailable");
});

test("when checks are off the automatic check never calls the bridge, a manual one does", async () => {
  reset();
  const calls = bridge(res("v1.1.0"));
  setEnabled(false);
  assert.equal((await checkForUpdate()).status, "off");
  assert.equal(calls.check, 0);
  assert.equal((await checkForUpdate({ manual: true })).status, "newer");
  assert.equal(calls.check, 1);
});

test("a newer stable release is reported with a clean version", async () => {
  reset();
  bridge(res("v1.1.0"));
  const r = await checkForUpdate();
  assert.equal(r.status, "newer");
  assert.deepEqual(r.latest, { version: "1.1.0", url: REL });
  assert.equal(r.current, "1.0.0");
});

test("equal, older (dev build) and unparsable tags all count as current", async () => {
  for (const tag of ["v1.0.0", "v0.9.0", "latest"]) {
    reset();
    bridge(res(tag));
    assert.equal((await checkForUpdate()).status, "current", tag);
  }
});

test("a bridge error flag or a thrown error becomes status error and never throws", async () => {
  reset();
  bridge({ current: "1.0.0", latest: null, error: true });
  assert.equal((await checkForUpdate()).status, "error");
  reset();
  bridge(new Error("ipc closed"));
  assert.equal((await checkForUpdate()).status, "error");
});

test("the failure reason is passed on (allowlisted); anything unexpected becomes unknown", async () => {
  for (const reason of ["rate_limit", "not_found", "network"]) {
    reset();
    bridge({ current: "1.0.0", latest: null, error: true, reason });
    assert.equal((await checkForUpdate()).reason, reason, reason);
  }
  for (const reason of ["<script>", 42, undefined, null]) {
    reset();
    bridge({ current: "1.0.0", latest: null, error: true, reason });
    const r = await checkForUpdate();
    assert.equal(r.status, "error");
    assert.equal(r.reason, "unknown", String(reason));
  }
  reset();
  bridge(new Error("ipc closed"));
  assert.equal((await checkForUpdate()).reason, "unknown");
});

test("openRelease forwards the URL and reports the bridge's answer", async () => {
  reset();
  const calls = bridge(res("v1.1.0"));
  assert.equal(await openRelease(REL), true);
  assert.equal(await openRelease("https://evil.com/"), false);
  assert.deepEqual(calls.open, [REL, "https://evil.com/"]);
  reset();
  assert.equal(await openRelease(REL), false);
});
