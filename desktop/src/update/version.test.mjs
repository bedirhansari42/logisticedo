import test from "node:test";
import assert from "node:assert/strict";
import { parseVersion, normalizeVersion, isNewer } from "./version.mjs";

test("parseVersion reads plain, v-prefixed and pre-release versions", () => {
  assert.deepEqual(parseVersion("v1.2.3"), { core: [1, 2, 3], pre: "" });
  assert.deepEqual(parseVersion(" 1.2.3 "), { core: [1, 2, 3], pre: "" });
  assert.equal(parseVersion("1.2.3-rc.1").pre, "rc.1");
});

test("parseVersion rejects anything that is not x.y.z", () => {
  for (const v of ["1.2", "1.2.3.4", "latest", "", null, undefined, 42, "1.2.3+b", {}]) assert.equal(parseVersion(v), null, String(v));
});

test("normalizeVersion strips the leading v", () => {
  assert.equal(normalizeVersion("v1.2.0"), "1.2.0");
  assert.equal(normalizeVersion("1.2.0-rc.1"), "1.2.0-rc.1");
  assert.equal(normalizeVersion("x"), null);
});

test("isNewer compares numerically, not as text", () => {
  assert.equal(isNewer("v1.2.0", "1.1.9"), true);
  assert.equal(isNewer("v1.0.10", "1.0.9"), true);
  assert.equal(isNewer("2.0.0", "1.99.99"), true);
});

test("isNewer is false for older or equal releases (dev build ahead of the latest release)", () => {
  assert.equal(isNewer("1.1.9", "1.2.0"), false);
  assert.equal(isNewer("1.2.0", "1.2.0"), false);
});

test("isNewer never offers a pre-release", () => {
  assert.equal(isNewer("1.2.0-rc.1", "1.1.0"), false);
  assert.equal(isNewer("1.1.0-rc.2", "1.1.0-rc.1"), false);
});

test("an installed pre-release is older than the matching stable release", () => {
  assert.equal(isNewer("1.1.0", "1.1.0-rc.1"), true);
});

test("isNewer is false when either side cannot be parsed", () => {
  assert.equal(isNewer("latest", "1.0.0"), false);
  assert.equal(isNewer("1.0.0", "garip"), false);
  assert.equal(isNewer(null, "1.0.0"), false);
});
