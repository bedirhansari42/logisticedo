const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isAllowed, isTrustedUrl, isTrustedSender } = require("./net-policy.js");

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
