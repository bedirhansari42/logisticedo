"use strict";
/* Güncelleme paketini indirir, akış boyunca SHA-256 hesaplar ve beklenen özetle karşılaştırır.
   Her hatada kısmi/yanlış dosya silinir; hata `.reason` taşır: network | size | digest | disk | aborted. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const fail = (reason, message) => Object.assign(new Error(message || reason), { reason });

async function downloadAsset({ fetchFn, asset, destDir, onProgress, signal }) {
  const file = path.join(destDir, path.basename(asset.name));
  let out = null;
  const drop = () => { try { out?.destroy(); } catch { /* yoksay */ } try { fs.rmSync(file, { force: true }); } catch { /* yoksay */ } };
  try {
    try { fs.mkdirSync(destDir, { recursive: true }); out = fs.createWriteStream(file); await new Promise((ok, no) => { out.once("open", ok); out.once("error", no); }); }
    catch (e) { throw fail("disk", e.message); }
    let res;
    try { res = await fetchFn(asset.url, { signal }); } catch (e) { throw fail(signal?.aborted ? "aborted" : "network", e.message); }
    if (!res || !res.ok || !res.body) throw fail("network", `HTTP ${res && res.status}`);
    const hash = crypto.createHash("sha256");
    let received = 0;
    try {
      for await (const chunk of res.body) {
        if (signal?.aborted) throw fail("aborted");
        received += chunk.length;
        if (received > asset.size) throw fail("size", "more bytes than expected");
        hash.update(chunk);
        try { if (!out.write(chunk)) await new Promise((ok) => out.once("drain", ok)); } catch (e) { throw fail("disk", e.message); }
        onProgress?.(received, asset.size);
      }
    } catch (e) {
      if (e.reason) throw e;
      throw fail(signal?.aborted ? "aborted" : "network", e.message);
    }
    if (signal?.aborted) throw fail("aborted");
    if (received !== asset.size) throw fail("size", "fewer bytes than expected");
    try { await new Promise((ok, no) => out.end((err) => (err ? no(err) : ok()))); } catch (e) { throw fail("disk", e.message); }
    if (`sha256:${hash.digest("hex")}` !== asset.digest) throw fail("digest", "sha256 mismatch");
    return file;
  } catch (e) {
    drop();
    throw e;
  }
}

function cleanupDir(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* yoksay */ } }

module.exports = { downloadAsset, cleanupDir };
