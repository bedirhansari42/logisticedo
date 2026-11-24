"use strict";
/* Güncelleme kontrolü: ana süreç tarafı. Renderer hiçbir dış adrese erişemez; yalnızca dar bir köprüyle (preload.js) üç iş ister:
   yüklü sürümü sormak, GitHub'daki en son kararlı release'i sormak, release sayfasını tarayıcıda açtırmak.
   İzinli tek adres net-policy.js'dedir; "aç" yalnızca bu deponun release sayfalarını açar. Her hata sessizce error:true olur. */
const { isReleaseUrl } = require("./net-policy.js");

const TIMEOUT_MS = 8000;

/** GitHub yanıtından yalnızca gerekenleri alır; taslak, ön sürüm ve yabancı adres null olur. */
function parseRelease(json) {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const { tag_name: tag, html_url: url, draft, prerelease } = json;
  if (typeof tag !== "string" || tag.length < 1 || tag.length > 64) return null;
  if (draft === true || prerelease === true) return null;
  if (typeof url !== "string" || !isReleaseUrl(url)) return null;
  return { tag, url };
}

/** Hata + nedeni: rate_limit (GitHub 403/429) | not_found (404) | network (bağlantı/zaman aşımı) | unknown. Arayüz yalnızca bu etiketi görür. */
const fail = (reason, message) => Object.assign(new Error(message), { reason });

async function fetchLatest(fetchFn, url, timeoutMs = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res;
    try {
      res = await fetchFn(url, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store", signal: ctrl.signal });
    } catch (e) { throw fail("network", e.message); } // bağlantı yok, DNS, zaman aşımı
    if (!res.ok) throw fail(res.status === 403 || res.status === 429 ? "rate_limit" : res.status === 404 ? "not_found" : "unknown", `HTTP ${res.status}`);
    let latest;
    try { latest = parseRelease(await res.json()); } catch (e) { throw fail("unknown", e.message); }
    if (!latest) throw fail("unknown", "unexpected release data");
    return latest;
  } finally { clearTimeout(timer); }
}

function register({ ipcMain, isTrusted, app, net, shell, updateUrl }) {
  ipcMain.handle("lgx:update:version", (e) => (isTrusted(e) ? app.getVersion() : ""));
  ipcMain.handle("lgx:update:check", async (e) => {
    if (!isTrusted(e)) return { current: "", latest: null, error: true, reason: "unknown" };
    const current = app.getVersion();
    try {
      return { current, latest: await fetchLatest(net.fetch.bind(net), updateUrl), error: false };
    } catch (e) {
      return { current, latest: null, error: true, reason: e?.reason || "unknown" };
    }
  });
  ipcMain.handle("lgx:update:open", async (e, url) => {
    if (!isTrusted(e) || typeof url !== "string" || !isReleaseUrl(url)) return false;
    await shell.openExternal(url);
    return true;
  });
}

module.exports = { parseRelease, fetchLatest, register };
