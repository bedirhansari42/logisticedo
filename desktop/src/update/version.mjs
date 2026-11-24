/* Sürüm ayrıştırma ve karşılaştırma (DOM'suz, testli). Yalnızca "x.y.z" ve "x.y.z-ön.sürüm" (baştaki "v" serbest) kabul edilir. */

const RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function parseVersion(input) {
  if (typeof input !== "string") return null;
  const m = RE.exec(input.trim());
  if (!m) return null;
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] || "" };
}

/** Baştaki "v" atılmış hâl ("v1.2.0" → "1.2.0"); ayrıştırılamıyorsa null. */
export function normalizeVersion(input) {
  const p = parseVersion(input);
  return p ? `${p.core.join(".")}${p.pre ? `-${p.pre}` : ""}` : null;
}

/** latest, current'tan yeni bir KARARLI sürüm mü? Ön sürüm hiç önerilmez; ayrıştırılamayan girdi false. */
export function isNewer(latest, current) {
  const l = parseVersion(latest), c = parseVersion(current);
  if (!l || !c || l.pre !== "") return false;
  for (let i = 0; i < 3; i++) if (l.core[i] !== c.core[i]) return l.core[i] > c.core[i];
  return c.pre !== ""; // çekirdek eşit: yüklü olan ön sürümse yayındaki kararlı sürüm yenidir
}
