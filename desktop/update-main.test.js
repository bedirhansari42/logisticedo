const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseRelease, fetchLatest, register } = require("./update-main.js");

const REL = "https://github.com/bedirhansari42/logisticedo/releases/tag/v1.2.0";
const good = { tag_name: "v1.2.0", html_url: REL, draft: false, prerelease: false };
const okFetch = (body, init = {}) => async () => ({ ok: true, status: 200, json: async () => body, ...init });

test("parseRelease accepts a stable release of this repo", () => {
  assert.deepEqual(parseRelease(good), { tag: "v1.2.0", url: REL });
});

test("parseRelease rejects drafts, pre-releases and malformed records", () => {
  for (const r of [
    { ...good, prerelease: true }, { ...good, draft: true },
    { html_url: REL }, { ...good, tag_name: "" }, { ...good, tag_name: "v".repeat(65) }, { ...good, tag_name: 5 },
    { ...good, html_url: "https://evil.com/bedirhansari42/logisticedo/releases/tag/v1" },
    { ...good, html_url: undefined }, null, "str", 42, []
  ]) assert.equal(parseRelease(r), null, JSON.stringify(r));
});

test("fetchLatest returns the release on a 200 with valid JSON", async () => {
  assert.deepEqual(await fetchLatest(okFetch(good), "https://x/"), { tag: "v1.2.0", url: REL });
});

test("fetchLatest bypasses the HTTP cache so an offline machine reports an error instead of a stale answer", async () => {
  let seen;
  await fetchLatest(async (_u, init) => { seen = init; return { ok: true, status: 200, json: async () => good }; }, "https://x/");
  assert.equal(seen.cache, "no-store");
});

test("fetchLatest rejects 404, 403 (rate limit), bad JSON and a foreign html_url", async () => {
  await assert.rejects(fetchLatest(okFetch(good, { ok: false, status: 404 }), "https://x/"));
  await assert.rejects(fetchLatest(okFetch(good, { ok: false, status: 403 }), "https://x/"));
  await assert.rejects(fetchLatest(okFetch(good, { json: async () => { throw new Error("html"); } }), "https://x/"));
  await assert.rejects(fetchLatest(okFetch({ ...good, html_url: "https://evil.com/" }), "https://x/"));
});

const reasonOf = async (p) => { try { await p; return null; } catch (e) { return e.reason; } };

test("fetchLatest tells apart rate limit, not found, network and other failures by err.reason", async () => {
  assert.equal(await reasonOf(fetchLatest(okFetch(good, { ok: false, status: 403 }), "https://x/")), "rate_limit");
  assert.equal(await reasonOf(fetchLatest(okFetch(good, { ok: false, status: 429 }), "https://x/")), "rate_limit");
  assert.equal(await reasonOf(fetchLatest(okFetch(good, { ok: false, status: 404 }), "https://x/")), "not_found");
  assert.equal(await reasonOf(fetchLatest(okFetch(good, { ok: false, status: 500 }), "https://x/")), "unknown");
  assert.equal(await reasonOf(fetchLatest(okFetch(good, { json: async () => { throw new Error("html"); } }), "https://x/")), "unknown");
  assert.equal(await reasonOf(fetchLatest(okFetch({ ...good, html_url: "https://evil.com/" }), "https://x/")), "unknown");
  assert.equal(await reasonOf(fetchLatest(async () => { throw new TypeError("fetch failed"); }, "https://x/")), "network");
  const hang = (_u, { signal }) => new Promise((_res, rej) => signal.addEventListener("abort", () => rej(new Error("aborted"))));
  assert.equal(await reasonOf(fetchLatest(hang, "https://x/", 20)), "network");
});

test("fetchLatest gives up after the timeout when the server never answers", async () => {
  const hang = (_u, { signal }) => new Promise((_res, rej) => signal.addEventListener("abort", () => rej(new Error("aborted"))));
  await assert.rejects(fetchLatest(hang, "https://x/", 20));
});

function setup({ trusted = true, fetchImpl, openExternal } = {}) {
  const handlers = {};
  const calls = { fetch: 0, open: [] };
  const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
  const net = { fetch: async (...a) => { calls.fetch++; return fetchImpl(...a); } };
  const shell = { openExternal: async (u) => { calls.open.push(u); } };
  register({ ipcMain, isTrusted: () => trusted, app: { getVersion: () => "1.0.0" }, net, shell, updateUrl: "https://x/" });
  return { handlers, calls };
}

test("check returns the latest release and the installed version", async () => {
  const { handlers } = setup({ fetchImpl: okFetch(good) });
  assert.deepEqual(await handlers["lgx:update:check"]({}), { current: "1.0.0", latest: { tag: "v1.2.0", url: REL }, error: false });
  assert.equal(await handlers["lgx:update:version"]({}), "1.0.0");
});

test("check never throws: a failing fetch becomes error:true", async () => {
  const { handlers } = setup({ fetchImpl: async () => { throw new Error("offline"); } });
  assert.deepEqual(await handlers["lgx:update:check"]({}), { current: "1.0.0", latest: null, error: true, reason: "network" });
  const h2 = setup({ fetchImpl: okFetch(good, { ok: false, status: 403 }) }).handlers;
  assert.deepEqual(await h2["lgx:update:check"]({}), { current: "1.0.0", latest: null, error: true, reason: "rate_limit" });
});

test("open launches only release pages of this repo", async () => {
  const { handlers, calls } = setup({ fetchImpl: okFetch(good) });
  assert.equal(await handlers["lgx:update:open"]({}, "https://evil.com/"), false);
  assert.equal(await handlers["lgx:update:open"]({}, 42), false);
  assert.deepEqual(calls.open, []);
  assert.equal(await handlers["lgx:update:open"]({}, REL), true);
  assert.deepEqual(calls.open, [REL]);
});

test("an untrusted sender gets nothing and triggers no request", async () => {
  const { handlers, calls } = setup({ trusted: false, fetchImpl: okFetch(good) });
  assert.deepEqual(await handlers["lgx:update:check"]({}), { current: "", latest: null, error: true, reason: "unknown" });
  assert.equal(await handlers["lgx:update:version"]({}), "");
  assert.equal(await handlers["lgx:update:open"]({}, REL), false);
  assert.equal(calls.fetch, 0);
  assert.deepEqual(calls.open, []);
});

// ---- Uygulama içinden kurulum (install / apply / cancel) ----
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { DOWNLOAD_PREFIX } = require("./net-policy.js");

const PKG = Buffer.from("p".repeat(50000) + "end");
const PKG_SHA = "sha256:" + crypto.createHash("sha256").update(PKG).digest("hex");
const winName = "logisticedo-Setup-1.2.0-win-x64.exe";
const macName = "logisticedo-1.2.0-mac-universal.zip";
const asset = (name, extra = {}) => ({ name, size: PKG.length, digest: PKG_SHA, browser_download_url: `${DOWNLOAD_PREFIX}v1.2.0/${name}`, ...extra });
const relJson = (assets) => ({ ...good, assets });
const bodyOf = (buf) => new ReadableStream({ start(c) { c.enqueue(buf); c.close(); } });

function installSetup({ platform = "win32", assets = [asset(winName), asset(macName)], trusted = true, env = {}, applyResult = { ok: true }, pkg = PKG } = {}) {
  const handlers = {};
  const events = []; const log = { fetch: [], apply: [], quit: 0 };
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lgx-um-"));
  const net = { fetch: async (url, init) => {
    log.fetch.push(url);
    if (url === "https://x/") return { ok: true, status: 200, json: async () => relJson(assets) };
    return { ok: true, status: 200, body: bodyOf(pkg) };
  } };
  register({
    ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; } }, isTrusted: () => trusted, app: { getVersion: () => "1.0.0", quit: () => { log.quit++; } },
    net, shell: { openExternal: async () => {} }, updateUrl: "https://x/", platform, env, pid: 7, execPath: "/x/logisticedo.exe", spawn: () => ({ unref() {} }), tmpRoot,
    applyUpdate: async (a) => { log.apply.push(a); return applyResult; }
  });
  const sender = { send: (ch, p) => { if (ch === "lgx:update:progress") events.push(p); } };
  const last = () => events.at(-1);
  const settled = async () => { for (let i = 0; i < 200 && !["ready", "error", "idle"].includes(last()?.state); i++) await new Promise((r) => setTimeout(r, 5)); return last(); };
  return { handlers, events, log, sender, settled, tmpRoot };
}

test("install downloads the platform package, verifies it and ends in ready", async () => {
  const t = installSetup();
  assert.deepEqual(await t.handlers["lgx:update:install"]({ sender: t.sender }), { ok: true });
  const end = await t.settled();
  assert.equal(end.state, "ready");
  assert.ok(t.log.fetch.includes(`${DOWNLOAD_PREFIX}v1.2.0/${winName}`));
  assert.ok(!t.log.fetch.some((u) => u.includes(macName)), "only this platform's package");
});

test("install reports no_asset when the release lacks this platform's package or has no digest", async () => {
  const a = installSetup({ assets: [asset(macName)] });
  assert.deepEqual(await a.handlers["lgx:update:install"]({ sender: a.sender }), { ok: false, reason: "no_asset" });
  const b = installSetup({ assets: [asset(winName, { digest: undefined })] });
  assert.deepEqual(await b.handlers["lgx:update:install"]({ sender: b.sender }), { ok: false, reason: "digest" });
  assert.ok(!b.log.fetch.some((u) => u.includes(winName)), "nothing downloaded");
});

test("a corrupted download ends in error/digest and leaves no file", async () => {
  const bad = Buffer.from(PKG); bad[3] ^= 1;
  const t = installSetup({ pkg: bad });
  await t.handlers["lgx:update:install"]({ sender: t.sender });
  const end = await t.settled();
  assert.deepEqual([end.state, end.reason], ["error", "digest"]);
  assert.equal(fs.existsSync(path.join(t.tmpRoot, "logisticedo-update", winName)), false);
});

test("portable Windows never installs", async () => {
  const t = installSetup({ env: { PORTABLE_EXECUTABLE_FILE: "a.exe" } });
  assert.deepEqual(await t.handlers["lgx:update:install"]({ sender: t.sender }), { ok: false, reason: "portable" });
  assert.equal(t.log.fetch.length, 0);
});

test("apply before ready is refused and does nothing; after ready it applies and quits", async () => {
  const t = installSetup();
  assert.deepEqual(await t.handlers["lgx:update:apply"]({ sender: t.sender }), { ok: false, reason: "unknown" });
  assert.equal(t.log.apply.length, 0);
  await t.handlers["lgx:update:install"]({ sender: t.sender }); await t.settled();
  assert.deepEqual(await t.handlers["lgx:update:apply"]({ sender: t.sender }), { ok: true });
  assert.equal(t.log.apply.length, 1);
  assert.equal(t.log.apply[0].platform, "win32");
  assert.equal(t.log.apply[0].file, path.join(t.tmpRoot, "logisticedo-update", winName));
  assert.equal(t.log.quit, 1);
});

test("a failed apply does not quit the app and reports the reason", async () => {
  const t = installSetup({ applyResult: { ok: false, reason: "not_writable" } });
  await t.handlers["lgx:update:install"]({ sender: t.sender }); await t.settled();
  assert.deepEqual(await t.handlers["lgx:update:apply"]({ sender: t.sender }), { ok: false, reason: "not_writable" });
  assert.equal(t.log.quit, 0);
});

test("a second install while downloading does not start another download; cancel returns to idle", async () => {
  const t = installSetup();
  await t.handlers["lgx:update:install"]({ sender: t.sender });
  await t.handlers["lgx:update:install"]({ sender: t.sender });
  await t.settled();
  assert.equal(t.log.fetch.filter((u) => u.includes(winName)).length, 1);
  assert.equal(await t.handlers["lgx:update:cancel"]({ sender: t.sender }), true);
  assert.equal(t.events.at(-1).state, "idle");
  assert.deepEqual(await t.handlers["lgx:update:apply"]({ sender: t.sender }), { ok: false, reason: "unknown" });
});

test("an untrusted sender cannot install, apply or cancel", async () => {
  const t = installSetup({ trusted: false });
  assert.equal((await t.handlers["lgx:update:install"]({ sender: t.sender })).ok, false);
  assert.equal((await t.handlers["lgx:update:apply"]({ sender: t.sender })).ok, false);
  assert.equal(await t.handlers["lgx:update:cancel"]({ sender: t.sender }), false);
  assert.equal(t.log.fetch.length, 0);
});

test("install ignores any argument: the renderer cannot choose the package", async () => {
  const t = installSetup();
  await t.handlers["lgx:update:install"]({ sender: t.sender }, "https://evil.com/x.exe");
  await t.settled();
  assert.ok(t.log.fetch.every((u) => u === "https://x/" || u.startsWith(DOWNLOAD_PREFIX)));
});
