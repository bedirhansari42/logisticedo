"use strict";
/* Güncelleme paketinin seçimi ve doğrulaması (saf mantık, ağ yok). Renderer paket adı/adres vermez; ana süreç release'ten kendisi seçer. */
const { DOWNLOAD_PREFIX } = require("./net-policy.js");

const MAX_BYTES = 600 * 1024 * 1024;
const PATTERNS = {
  win32: /^logisticedo-Setup-.+-win-x64\.exe$/,
  darwin: /^logisticedo-.+-mac-universal\.zip$/
};

/** GitHub release JSON'unun assets[] alanından {name,size,url,digest}; bozuk öğeler atlanır, asla fırlatmaz. */
function parseAssets(json) {
  const list = json && typeof json === "object" ? json.assets : null;
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const a of list) {
    if (!a || typeof a !== "object") continue;
    const { name, size, digest, browser_download_url: url } = a;
    if (typeof name !== "string" || typeof url !== "string") continue;
    out.push({ name, size, url, digest });
  }
  return out;
}

function pickAsset(assets, platform) {
  const re = PATTERNS[platform];
  if (!re || !Array.isArray(assets)) return null;
  return assets.find((a) => re.test(a.name)) || null;
}

function validateAsset(asset, { tag, downloadPrefix = DOWNLOAD_PREFIX }) {
  if (!asset || typeof tag !== "string") return false;
  if (asset.url !== `${downloadPrefix}${tag}/${asset.name}`) return false;
  if (typeof asset.digest !== "string" || !/^sha256:[0-9a-f]{64}$/.test(asset.digest)) return false;
  return Number.isInteger(asset.size) && asset.size >= 1 && asset.size <= MAX_BYTES;
}

module.exports = { parseAssets, pickAsset, validateAsset, MAX_BYTES };
