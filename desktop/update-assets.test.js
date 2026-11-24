const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseAssets, pickAsset, validateAsset, MAX_BYTES } = require("./update-assets.js");
const { DOWNLOAD_PREFIX } = require("./net-policy.js");

const H = "a".repeat(64);
const raw = (name, extra = {}) => ({ name, size: 1000, digest: `sha256:${H}`, browser_download_url: `${DOWNLOAD_PREFIX}v1.0.2/${name}`, ...extra });
const release = { assets: [
  raw("logisticedo-1.0.2-mac-universal.dmg"), raw("logisticedo-1.0.2-mac-universal.zip"),
  raw("logisticedo-Portable-1.0.2-win-x64.exe"), raw("logisticedo-Setup-1.0.2-win-x64.exe")
] };

test("parseAssets maps GitHub fields and skips malformed entries without throwing", () => {
  const a = parseAssets(release);
  assert.equal(a.length, 4);
  assert.deepEqual(a[0], { name: "logisticedo-1.0.2-mac-universal.dmg", size: 1000, url: `${DOWNLOAD_PREFIX}v1.0.2/logisticedo-1.0.2-mac-universal.dmg`, digest: `sha256:${H}` });
  for (const bad of [null, undefined, "x", 5, {}, { assets: "x" }]) assert.deepEqual(parseAssets(bad), []);
  assert.equal(parseAssets({ assets: [null, 3, { name: 1 }, raw("ok.zip")] }).length, 1);
});

test("pickAsset chooses the installer for the platform and never the portable build or the dmg", () => {
  const a = parseAssets(release);
  assert.equal(pickAsset(a, "win32").name, "logisticedo-Setup-1.0.2-win-x64.exe");
  assert.equal(pickAsset(a, "darwin").name, "logisticedo-1.0.2-mac-universal.zip");
  assert.equal(pickAsset(a, "linux"), null);
  assert.equal(pickAsset([], "win32"), null);
  assert.equal(pickAsset(a.filter((x) => !x.name.includes("Setup")), "win32"), null);
});

test("validateAsset requires exact url, sha256 digest and a sane size", () => {
  const good = parseAssets(release)[3];
  const ctx = { tag: "v1.0.2" };
  assert.equal(validateAsset(good, ctx), true);
  assert.equal(validateAsset({ ...good, url: `${DOWNLOAD_PREFIX}v1.0.1/${good.name}` }, ctx), false, "wrong tag");
  assert.equal(validateAsset({ ...good, url: "https://evil.com/" + good.name }, ctx), false, "foreign host");
  for (const digest of ["", undefined, "sha1:" + H, "sha256:" + "a".repeat(63), "sha256:" + "A".repeat(64), H])
    assert.equal(validateAsset({ ...good, digest }, ctx), false, String(digest));
  for (const size of [0, -1, MAX_BYTES + 1, NaN, "5"]) assert.equal(validateAsset({ ...good, size }, ctx), false, String(size));
  assert.equal(validateAsset({ ...good, size: MAX_BYTES }, ctx), true);
  const t = { tag: "v1", downloadPrefix: "http://localhost:8799/dl/" };
  assert.equal(validateAsset({ ...good, url: "http://localhost:8799/dl/v1/" + good.name }, t), true);
});
