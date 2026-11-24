const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { downloadAsset, cleanupDir } = require("./update-download.js");

const data = Buffer.from("x".repeat(100000) + "payload");
const sha = (b) => "sha256:" + crypto.createHash("sha256").update(b).digest("hex");
const asset = (b = data, extra = {}) => ({ name: "pkg.zip", size: b.length, url: "https://x/pkg.zip", digest: sha(b), ...extra });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "lgx-dl-"));
const chunks = (b, n = 4) => { const s = Math.ceil(b.length / n); return Array.from({ length: n }, (_, i) => b.subarray(i * s, (i + 1) * s)).filter((c) => c.length); };
const streamRes = (parts, { failAt, status = 200 } = {}) => ({
  ok: status === 200, status,
  body: new ReadableStream({
    async pull(c) {
      if (parts.length === 0) return c.close();
      if (failAt !== undefined && parts.length === failAt) return c.error(new Error("reset"));
      c.enqueue(parts.shift());
    }
  })
});
const reason = async (p) => { try { await p; } catch (e) { return e.reason; } return "none"; };

test("a correct download is written, verified and reported to 100%", async () => {
  const dir = tmp(); const seen = [];
  const file = await downloadAsset({ fetchFn: async () => streamRes(chunks(data)), asset: asset(), destDir: dir, onProgress: (r, t) => seen.push([r, t]) });
  assert.equal(file, path.join(dir, "pkg.zip"));
  assert.deepEqual(fs.readFileSync(file), data);
  assert.deepEqual(seen.at(-1), [data.length, data.length]);
});

test("a wrong digest deletes the file and fails with reason digest", async () => {
  const dir = tmp(); const bad = Buffer.from(data); bad[5] ^= 1;
  assert.equal(await reason(downloadAsset({ fetchFn: async () => streamRes(chunks(bad)), asset: asset(), destDir: dir })), "digest");
  assert.equal(fs.existsSync(path.join(dir, "pkg.zip")), false);
});

test("a dropped connection, an HTTP error or a fetch failure is reason network and leaves no file", async () => {
  for (const fetchFn of [async () => streamRes(chunks(data), { failAt: 2 }), async () => streamRes([], { status: 404 }), async () => { throw new Error("dns"); }]) {
    const dir = tmp();
    assert.equal(await reason(downloadAsset({ fetchFn, asset: asset(), destDir: dir })), "network");
    assert.deepEqual(fs.readdirSync(dir), []);
  }
});

test("more or fewer bytes than the asset size fail with reason size", async () => {
  const dir = tmp();
  const more = Buffer.concat([data, Buffer.from("extra")]);
  assert.equal(await reason(downloadAsset({ fetchFn: async () => streamRes(chunks(more)), asset: asset(data, { digest: sha(more) }), destDir: dir })), "size");
  assert.equal(await reason(downloadAsset({ fetchFn: async () => streamRes(chunks(data.subarray(0, 10))), asset: asset(), destDir: dir })), "size");
  assert.deepEqual(fs.readdirSync(dir), []);
});

test("aborting stops the download with reason aborted and removes the partial file", async () => {
  const dir = tmp(); const ctrl = new AbortController();
  const p = downloadAsset({ fetchFn: async () => streamRes(chunks(data)), asset: asset(), destDir: dir, signal: ctrl.signal, onProgress: () => ctrl.abort() });
  assert.equal(await reason(p), "aborted");
  assert.deepEqual(fs.readdirSync(dir), []);
});

test("an unwritable destination is reason disk", async () => {
  const dir = tmp(); const blocker = path.join(dir, "file"); fs.writeFileSync(blocker, "x");
  assert.equal(await reason(downloadAsset({ fetchFn: async () => streamRes(chunks(data)), asset: asset(), destDir: path.join(blocker, "sub") })), "disk");
});

test("cleanupDir removes a folder and never throws on a missing one", () => {
  const dir = tmp(); fs.writeFileSync(path.join(dir, "a"), "1");
  cleanupDir(dir); assert.equal(fs.existsSync(dir), false);
  assert.doesNotThrow(() => cleanupDir(path.join(dir, "nope")));
});
