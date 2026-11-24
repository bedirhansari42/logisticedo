"use strict";
/* Güncelleme kontrolü: ana süreç tarafı. Renderer hiçbir dış adrese erişemez; yalnızca dar bir köprüyle (preload.js) üç iş ister:
   yüklü sürümü sormak, GitHub'daki en son kararlı release'i sormak, release sayfasını tarayıcıda açtırmak.
   İzinli tek adres net-policy.js'dedir; "aç" yalnızca bu deponun release sayfalarını açar. Her hata sessizce error:true olur. */
const path = require("node:path");
const { isReleaseUrl, DOWNLOAD_PREFIX } = require("./net-policy.js");
const assetsApi = require("./update-assets.js");
const downloadApi = require("./update-download.js");
const applyApi = require("./update-apply.js");

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

/** Release JSON'unu ham olarak getirir (durum kodu/zaman aşımı kuralları fetchLatest ile aynı). */
async function fetchJson(fetchFn, url, timeoutMs = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res;
    try {
      res = await fetchFn(url, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store", signal: ctrl.signal });
    } catch (e) { throw fail("network", e.message); } // bağlantı yok, DNS, zaman aşımı
    if (!res.ok) throw fail(res.status === 403 || res.status === 429 ? "rate_limit" : res.status === 404 ? "not_found" : "unknown", `HTTP ${res.status}`);
    try { return await res.json(); } catch (e) { throw fail("unknown", e.message); }
  } finally { clearTimeout(timer); }
}

async function fetchLatest(fetchFn, url, timeoutMs = TIMEOUT_MS) {
  const latest = parseRelease(await fetchJson(fetchFn, url, timeoutMs));
  if (!latest) throw fail("unknown", "unexpected release data");
  return latest;
}

function register({
  ipcMain, isTrusted, app, net, shell, updateUrl,
  // kurulum (testte değiştirilebilir)
  packaged = app.isPackaged, platform = process.platform, env = process.env, pid = process.pid, execPath = process.execPath, spawn, tmpRoot,
  downloadPrefix = DOWNLOAD_PREFIX, downloadAsset = downloadApi.downloadAsset, applyUpdate = applyApi.applyUpdate
}) {
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

  // ---- Uygulama içinden kurulum: idle → downloading → ready | error ----
  const dir = tmpRoot ? path.join(tmpRoot, "logisticedo-update") : null;
  let st = { state: "idle", file: null, ctrl: null };
  const send = (e, payload) => { try { e.sender.send("lgx:update:progress", payload); } catch { /* pencere kapanmış */ } };
  const toError = (e, reason) => { st = { state: "error", file: null, ctrl: null }; send(e, { state: "error", reason }); return { ok: false, reason }; };

  ipcMain.handle("lgx:update:install", async (e) => {
    if (!isTrusted(e)) return { ok: false, reason: "unknown" };
    if (st.state === "downloading") return { ok: true };
    if (st.state === "ready") { send(e, { state: "ready", percent: 100 }); return { ok: true }; }
    if (platform === "win32" && applyApi.isPortable(env)) return { ok: false, reason: "portable" };
    let json;
    try { json = await fetchJson(net.fetch.bind(net), updateUrl); } catch (err) { return { ok: false, reason: err?.reason === "network" ? "network" : "unknown" }; }
    const rel = parseRelease(json);
    if (!rel) return { ok: false, reason: "unknown" };
    const pick = assetsApi.pickAsset(assetsApi.parseAssets(json), platform);
    if (!pick) return { ok: false, reason: "no_asset" };
    if (!assetsApi.validateAsset(pick, { tag: rel.tag, downloadPrefix })) return { ok: false, reason: "digest" };
    const ctrl = new AbortController();
    st = { state: "downloading", file: null, ctrl };
    send(e, { state: "downloading", percent: 0 });
    let lastPct = -1;
    downloadAsset({
      fetchFn: net.fetch.bind(net), asset: pick, destDir: dir, signal: ctrl.signal,
      onProgress: (got, total) => { const pct = Math.floor((got / total) * 100); if (pct !== lastPct) { lastPct = pct; send(e, { state: "downloading", percent: pct }); } }
    }).then((file) => {
      if (st.ctrl !== ctrl) return downloadApi.cleanupDir(dir); // bu arada iptal edildi
      st = { state: "ready", file, ctrl: null };
      send(e, { state: "ready", percent: 100 });
    }).catch((err) => {
      if (st.ctrl !== ctrl) return;
      if (err?.reason === "aborted") { st = { state: "idle", file: null, ctrl: null }; return send(e, { state: "idle" }); }
      toError(e, err?.reason || "unknown");
    });
    return { ok: true };
  });

  ipcMain.handle("lgx:update:apply", async (e) => {
    if (!isTrusted(e) || st.state !== "ready" || !st.file) return { ok: false, reason: "unknown" };
    // npm start / electron . : çalışan "uygulama" node_modules içindeki Electron'dur; yerine paket konmaz
    if (!packaged) return toError(e, "not_packaged");
    const r = await applyUpdate({ platform, file: st.file, execPath, pid, env, spawn, tmpDir: dir });
    if (r.ok) { app.quit(); return { ok: true }; }
    return toError(e, r.reason || "unknown");
  });

  ipcMain.handle("lgx:update:cancel", (e) => {
    if (!isTrusted(e)) return false;
    const was = st;
    st = { state: "idle", file: null, ctrl: null };
    was.ctrl?.abort();
    if (dir) downloadApi.cleanupDir(dir);
    send(e, { state: "idle" });
    return true;
  });

  ipcMain.handle("lgx:update:open", async (e, url) => {
    if (!isTrusted(e) || typeof url !== "string" || !isReleaseUrl(url)) return false;
    await shell.openExternal(url);
    return true;
  });
}

module.exports = { parseRelease, fetchLatest, register };
