/* Kalem renkleri: çizimlerde ve PDF'te aynı kalem aynı renk. */
export const PALETTE = ["#00827c", "#d9a441", "#7b8fd1", "#c97b63", "#8fc16a", "#a77bd1", "#4fb3c9", "#d1c27b", "#c9739b", "#6e9c7a"];

export function makeColorOf(items) {
  const map = new Map(items.map((it, i) => [it.id, PALETTE[i % PALETTE.length]]));
  return (id) => map.get(id) || "#888888";
}
