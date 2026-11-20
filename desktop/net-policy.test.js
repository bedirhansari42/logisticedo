const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isAllowed } = require("./net-policy.js");

const o = { scheme: "app", devUrl: null };

test("app scheme and local schemes are allowed", () => {
  for (const u of ["app://logisticedo/x", "data:text/plain,a", "blob:app://logisticedo/1", "file:///a", "devtools://devtools/x"])
    assert.equal(isAllowed(u, o), true, u);
});

test("only the two Firebase Auth hosts over https are allowed", () => {
  for (const h of ["identitytoolkit.googleapis.com", "securetoken.googleapis.com"])
    assert.equal(isAllowed(`https://${h}/v1/x`, o), true, h);
});

test("lookalike hosts, http, and other Google hosts are blocked", () => {
  for (const u of [
    "https://evil.com/",
    "https://identitytoolkit.googleapis.com.evil.com/",
    "https://evil.com/?https://securetoken.googleapis.com/",
    "https://firestore.googleapis.com/v1/x",
    "http://identitytoolkit.googleapis.com/",
    "https://apis.google.com/js/api.js",
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
