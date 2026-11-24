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
