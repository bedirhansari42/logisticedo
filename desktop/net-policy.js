"use strict";
/* lockNetwork'ün izin kararı. Yalnızca uygulamanın kendi protokolü, yerel şemalar ve geliştirme sunucusu açıktır; dış ağ yok. */

const parse = (u) => { try { return new URL(u); } catch { return null; } };
// Önek eşlemesi değil, ayrıştırılmış adres karşılaştırılır: "localhost:5173.evil.com" gibi benzer adresler eşleşmez.
const sameHost = (url, other) => { const a = parse(url), b = parse(other); return !!a && !!b && a.protocol === b.protocol && a.host === b.host; };

function isAllowed(url, { scheme, devUrl }) {
  if (url.startsWith(scheme + "://")) return true;
  if (devUrl && sameHost(url, devUrl)) return true;
  if (devUrl) { const w = parse(url); if (w && w.protocol === "ws:" && w.hostname === "localhost") return true; }
  if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("devtools:") || url.startsWith("file:")) return true;
  return false;
}

/** IPC ve gezinme için güvenilen sayfa: yalnızca app://<host> (host sabit) ya da geliştirme sunucusunun tam adresi. */
function isTrustedUrl(url, { scheme, host, devUrl }) {
  const u = parse(url);
  if (!u) return false;
  if (u.protocol === scheme + ":" && u.host === host) return true;
  return !!devUrl && sameHost(url, devUrl);
}

/** IPC gönderen çerçevesi: güvenilen adres ve üst düzey çerçeve (alt çerçeve olamaz). */
function isTrustedSender(event, opts) {
  const f = event && event.senderFrame;
  if (!f || f.parent) return false;
  return isTrustedUrl(f.url || "", opts);
}

module.exports = { isAllowed, isTrustedUrl, isTrustedSender };
