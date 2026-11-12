/* Yerleşimleri başlangıç yüksekliğine (z) göre katmanlara ayırır. */
const round = (z) => Math.round(z * 1000) / 1000;

export function groupByLayer(placements) {
  const map = new Map();
  for (const p of placements) {
    const z = round(p.z);
    if (!map.has(z)) map.set(z, []);
    map.get(z).push(p);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([z, list]) => ({ z, placements: list }));
}
