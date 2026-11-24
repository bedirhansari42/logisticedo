import test from "node:test";
import assert from "node:assert/strict";
import { initialInstall, nextInstall, canInstall } from "./install.mjs";

test("the offer starts at 0% with no reason", () => {
  assert.deepEqual(initialInstall, { phase: "offer", percent: 0, reason: "" });
});

test("start, progress, ready, error and idle events move the phase", () => {
  let s = nextInstall(initialInstall, { type: "start" });
  assert.deepEqual(s, { phase: "downloading", percent: 0, reason: "" });
  s = nextInstall(s, { type: "progress", state: "downloading", percent: 42 });
  assert.deepEqual(s, { phase: "downloading", percent: 42, reason: "" });
  assert.equal(nextInstall(s, { type: "progress", state: "ready" }).phase, "ready");
  assert.equal(nextInstall(s, { type: "progress", state: "ready" }).percent, 100);
  const e = nextInstall(s, { type: "progress", state: "error", reason: "digest" });
  assert.deepEqual(e, { phase: "error", percent: 42, reason: "digest" });
  assert.deepEqual(nextInstall(e, { type: "progress", state: "idle" }), initialInstall);
  assert.deepEqual(nextInstall(e, { type: "reset" }), initialInstall);
});

test("malformed events leave the state unchanged and percent is clamped", () => {
  const s = { phase: "downloading", percent: 10, reason: "" };
  for (const ev of [null, undefined, {}, { type: "bogus" }, { type: "progress", state: "weird" }]) assert.deepEqual(nextInstall(s, ev), s);
  assert.equal(nextInstall(s, { type: "progress", state: "downloading", percent: 250 }).percent, 100);
  assert.equal(nextInstall(s, { type: "progress", state: "downloading", percent: -5 }).percent, 0);
  assert.equal(nextInstall(s, { type: "progress", state: "downloading", percent: "x" }).percent, 10);
  assert.equal(nextInstall(s, { type: "progress", state: "error", reason: "<script>" }).reason, "unknown");
});

test("canInstall needs the bridge and a non-portable build", () => {
  assert.equal(canInstall({ hasBridge: true }), true);
  assert.equal(canInstall({ hasBridge: false }), false);
  assert.equal(canInstall({ hasBridge: true, portable: true }), false);
});

test("not_packaged is a known reason", () => {
  assert.equal(nextInstall(initialInstall, { type: "progress", state: "error", reason: "not_packaged" }).reason, "not_packaged");
});
