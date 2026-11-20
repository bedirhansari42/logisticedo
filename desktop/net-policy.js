"use strict";
/* lockNetwork'ün izin kararı. Uygulama dışına yalnızca giriş için gereken iki Firebase Auth alan adı açıktır. */
const FIREBASE_HOSTS = new Set(["identitytoolkit.googleapis.com", "securetoken.googleapis.com"]);

function isAllowed(url, { scheme, devUrl }) {
  if (url.startsWith(scheme + "://")) return true;
  if (devUrl && url.startsWith(devUrl.replace(/\/$/, ""))) return true;
  if (devUrl && url.startsWith("ws://localhost")) return true;
  if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("devtools:") || url.startsWith("file:")) return true;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && FIREBASE_HOSTS.has(u.hostname);
  } catch { return false; }
}

module.exports = { isAllowed };
