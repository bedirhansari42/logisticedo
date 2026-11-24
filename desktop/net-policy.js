"use strict";
/* lockNetwork'ün izin kararı. Yalnızca uygulamanın kendi protokolü, yerel şemalar ve geliştirme sunucusu açıktır.
   Tek dış istisna: sürüm kontrolü için GitHub'ın "en son release" adresi (tam eşleşme). */
const REPO = "bedirhansari42/logisticedo";
const UPDATE_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

const parse = (u) => { try { return new URL(u); } catch { return null; } };
// Önek eşlemesi değil, ayrıştırılmış adres karşılaştırılır: "localhost:5173.evil.com" gibi benzer adresler eşleşmez.
const sameHost = (url, other) => { const a = parse(url), b = parse(other); return !!a && !!b && a.protocol === b.protocol && a.host === b.host; };

/** method ve fromRenderer (isteği bir sayfa mı yaptı, yoksa ana süreç mi) verilmezse güncelleme adresi reddedilir. */
function isAllowed(url, { scheme, devUrl, updateUrl = UPDATE_API_URL, method, fromRenderer }) {
  if (url.startsWith(scheme + "://")) return true;
  if (devUrl && sameHost(url, devUrl)) return true;
  if (devUrl) { const w = parse(url); if (w && w.protocol === "ws:" && w.hostname === "localhost") return true; }
  if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("devtools:") || url.startsWith("file:")) return true;
  // Sürüm kontrolü: yalnızca ana sürecin yaptığı GET isteği; sayfa kodu bu adrese hiçbir şey gönderemez.
  return url === updateUrl && method === "GET" && fromRenderer === false;
}

/** "İndir" yalnızca bu deponun release sayfalarını açabilir (https, github.com, kimlik bilgisi ve port yok). */
function isReleaseUrl(url) {
  const u = parse(url);
  if (!u || u.protocol !== "https:" || u.host !== "github.com" || u.username || u.password) return false;
  const base = `/${REPO}/releases`;
  return u.pathname === base || u.pathname.startsWith(base + "/");
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

module.exports = { isAllowed, isTrustedUrl, isTrustedSender, isReleaseUrl, REPO, UPDATE_API_URL };
