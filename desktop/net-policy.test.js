const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isAllowed, isTrustedUrl, isTrustedSender, isReleaseUrl, UPDATE_API_URL } = require("./net-policy.js");

const o = { scheme: "app", devUrl: null };

test("app scheme and local schemes are allowed", () => {
  for (const u of ["app://logisticedo/x", "data:text/plain,a", "blob:app://logisticedo/1", "file:///a", "devtools://devtools/x"])
    assert.equal(isAllowed(u, o), true, u);
});

test("every external host is blocked, including former Firebase Auth hosts", () => {
  for (const u of [
    "https://evil.com/",
    "https://identitytoolkit.googleapis.com/v1/x",
    "https://securetoken.googleapis.com/v1/x",
    "https://firestore.googleapis.com/v1/x",
    "http://example.com/",
    "https://accounts.google.com/"
  ]) assert.equal(isAllowed(u, o), false, u);
});

test("dev server is allowed only when devUrl is given", () => {
  assert.equal(isAllowed("http://localhost:5173/a", o), false);
  const d = { scheme: "app", devUrl: "http://localhost:5173/" };
  assert.equal(isAllowed("http://localhost:5173/a", d), true);
  assert.equal(isAllowed("ws://localhost:5173/", d), true);
  assert.equal(isAllowed("http://localhost:9999/", d), false);
});

test("dev server lookalikes are blocked (origin compared, not prefix)", () => {
  const d = { scheme: "app", devUrl: "http://localhost:5173/" };
  for (const u of ["http://localhost:5173.evil.com/", "http://localhost:51730/", "http://localhost:5173@evil.com/", "ws://localhost.evil.com/", "ws://localhost:5173.evil.com/"])
    assert.equal(isAllowed(u, d), false, u);
  assert.equal(isAllowed("ws://localhost:5173/", d), true);
});

const T = { scheme: "app", host: "logisticedo", devUrl: null };

test("isTrustedUrl: only app://logisticedo (host pinned), or the exact dev origin", () => {
  assert.equal(isTrustedUrl("app://logisticedo/index.html", T), true);
  for (const u of ["app://evil/index.html", "app://logisticedo.evil.com/", "app://", "", "not a url", "https://logisticedo/", "file:///x", "data:text/html,a", "blob:app://logisticedo/1"])
    assert.equal(isTrustedUrl(u, T), false, u);
  const d = { ...T, devUrl: "http://localhost:5173/" };
  assert.equal(isTrustedUrl("http://localhost:5173/src/main.jsx", d), true);
  for (const u of ["http://localhost:5173.evil.com/", "http://localhost:5174/", "http://localhost:5173@evil.com/", "https://localhost:5173/"])
    assert.equal(isTrustedUrl(u, d), false, u);
  assert.equal(isTrustedUrl("http://localhost:5173/", T), false);
});

test("isTrustedSender: trusted URL and top-level frame only", () => {
  const ev = (url, parent = null) => ({ senderFrame: { url, parent } });
  assert.equal(isTrustedSender(ev("app://logisticedo/index.html"), T), true);
  assert.equal(isTrustedSender(ev("app://logisticedo/index.html", { url: "app://logisticedo/" }), T), false);
  assert.equal(isTrustedSender(ev("app://evil/"), T), false);
  assert.equal(isTrustedSender({ senderFrame: null }, T), false);
  assert.equal(isTrustedSender({}, T), false);
  assert.equal(isTrustedSender(undefined, T), false);
});

const g = { ...o, method: "GET", fromRenderer: false }; // ana süreçten gelen GET isteği

test("only the exact GitHub latest-release API URL is allowed for the update check", () => {
  assert.equal(isAllowed(UPDATE_API_URL, g), true);
  for (const u of [
    UPDATE_API_URL + "?x=1",
    "https://api.github.com/repos/bedirhansari42/logisticedo/releases",
    "https://api.github.com/repos/baska/repo/releases/latest",
    "http://api.github.com/repos/bedirhansari42/logisticedo/releases/latest",
    "https://api.github.com.evil.com/repos/bedirhansari42/logisticedo/releases/latest"
  ]) assert.equal(isAllowed(u, g), false, u);
});

test("the update URL is for GET requests from the main process only: never POST, never the page", () => {
  assert.equal(isAllowed(UPDATE_API_URL, { ...g, method: "POST" }), false);
  assert.equal(isAllowed(UPDATE_API_URL, { ...g, method: "PUT" }), false);
  assert.equal(isAllowed(UPDATE_API_URL, { ...g, fromRenderer: true }), false);
  assert.equal(isAllowed(UPDATE_API_URL, o), false); // method/fromRenderer belirtilmezse reddedilir (güvenli varsayılan)
});

test("a custom updateUrl (development override) allows only that exact URL", () => {
  const c = { ...g, updateUrl: "http://localhost:8799/latest.json" };
  assert.equal(isAllowed("http://localhost:8799/latest.json", c), true);
  assert.equal(isAllowed("http://localhost:8799/latest.json", { ...c, method: "POST" }), false);
  assert.equal(isAllowed("http://localhost:8799/other.json", c), false);
  assert.equal(isAllowed(UPDATE_API_URL, c), false);
});

test("isReleaseUrl accepts only this repo's releases pages on github.com over https", () => {
  for (const u of ["https://github.com/bedirhansari42/logisticedo/releases/tag/v1.2.0", "https://github.com/bedirhansari42/logisticedo/releases"])
    assert.equal(isReleaseUrl(u), true, u);
  for (const u of [
    "https://github.com/bedirhansari42/logisticedo",
    "https://github.com/baska/logisticedo/releases/tag/v1",
    "https://github.com.evil.com/bedirhansari42/logisticedo/releases",
    "http://github.com/bedirhansari42/logisticedo/releases",
    "https://evil.com/bedirhansari42/logisticedo/releases",
    "https://user@github.com/bedirhansari42/logisticedo/releases",
    "https://github.com:8443/bedirhansari42/logisticedo/releases",
    "not a url", "", null, undefined
  ]) assert.equal(isReleaseUrl(u), false, String(u));
});
