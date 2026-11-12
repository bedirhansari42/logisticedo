import { useEffect, useMemo, useRef } from "react";
import { groupByLayer } from "../../planner/layers.mjs";
import { makeColorOf } from "../../planner/colors.mjs";

export const LABEL_LIMIT = 400; // bundan fazla kutuda sıra numaraları çizilmez (çizim sadeleşir)

export { makeColorOf };

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const shade = (hex, f) => `rgb(${rgb(hex).map((v) => Math.max(0, Math.min(255, Math.round(v * f)))).join(",")})`;

/** Kalem+z gruplarına göre tek <path>: DOM küçük kalır, alttan üste boyanır */
function groupPaths(placements, colorOf) {
  const groups = new Map();
  for (const p of [...placements].sort((a, b) => a.z - b.z || a.seq - b.seq)) {
    const key = `${p.itemId}|${p.z}`;
    if (!groups.has(key)) groups.set(key, { color: colorOf(p.itemId), d: "" });
    groups.get(key).d += p.kind === "up"
      ? `M${p.x} ${p.y + p.dy / 2}a${p.dx / 2} ${p.dy / 2} 0 1 0 ${p.dx} 0a${p.dx / 2} ${p.dy / 2} 0 1 0 ${-p.dx} 0z` // dik silindir: tepeden daire
      : `M${p.x} ${p.y}h${p.dx}v${p.dy}h${-p.dx}z`;
  }
  return [...groups.values()];
}

export function TopView({ container, placements, colorOf, showSeq = true, doorLabel = "DOOR", backLabel = "BACK", className = "" }) {
  const { L, W } = container;
  const paths = useMemo(() => groupPaths(placements, colorOf), [placements, colorOf]);
  const minZ = placements.length ? Math.min(...placements.map((p) => p.z)) : 0;
  const labelList = showSeq ? placements.filter((p) => p.z === minZ) : []; // üst üste kutuların numaraları üst üste binmesin: yalnızca en alttaki katman
  const labels = labelList.length > 0 && labelList.length <= LABEL_LIMIT;
  const pad = Math.max(L, W) * 0.02;
  return (
    <svg className={`pl-svg ${className}`.trim()} viewBox={`${-pad - 24} ${-pad} ${L + pad * 2 + 48} ${W + pad * 2}`} role="img" aria-label="Top view">
      <rect x="0" y="0" width={L} height={W} className="pl-floor" />
      {paths.map((g, i) => <path key={i} d={g.d} fill={g.color} fillOpacity="0.88" className="pl-box" />)}
      {labels && labelList.map((p) => {
        const m = Math.min(p.dx, p.dy);
        if (m < 9) return null;
        return <text key={p.seq} x={p.x + p.dx / 2} y={p.y + p.dy / 2} fontSize={Math.max(4, Math.min(14, m * 0.45))} className="pl-seq">{p.seq}</text>;
      })}
      <text x={-4} y={W / 2} fontSize="9" textAnchor="end" className="pl-axis">{backLabel}</text>
      <text x={L + 4} y={W / 2} fontSize="9" className="pl-axis">{doorLabel}</text>
    </svg>
  );
}

export function LayerView({ container, placements, colorOf, layerLabel }) {
  const layers = useMemo(() => groupByLayer(placements), [placements]);
  return (
    <div className="pl-layers">
      {layers.map((l, i) => (
        <figure key={l.z} className="pl-layer">
          <figcaption>{layerLabel(i + 1, l.z)}</figcaption>
          <TopView container={container} placements={l.placements} colorOf={colorOf} showSeq doorLabel="" backLabel="" />
        </figure>
      ))}
    </div>
  );
}

/** İzometrik 3D (canvas): arka duvar sol üstte, kapı sağ altta */
export function IsoView({ container, placements, colorOf, doorLabel = "DOOR" }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const { L, W, H } = container;
    const C30 = Math.cos(Math.PI / 6);
    const raw = (x, y, z) => [(x - y) * C30, (x + y) * 0.5 - z];
    const corners = [[0, 0, 0], [L, 0, 0], [0, W, 0], [L, W, 0], [0, 0, H], [L, 0, H], [0, W, H], [L, W, H]].map((c) => raw(...c));
    const minX = Math.min(...corners.map((c) => c[0])), maxX = Math.max(...corners.map((c) => c[0]));
    const minY = Math.min(...corners.map((c) => c[1])), maxY = Math.max(...corners.map((c) => c[1]));
    const PAD = 24, CW = 1400;
    const s = (CW - PAD * 2) / (maxX - minX);
    const CH = Math.ceil((maxY - minY) * s + PAD * 2);
    cv.width = CW; cv.height = CH;
    const g = cv.getContext("2d");
    g.clearRect(0, 0, CW, CH);
    const P = (x, y, z) => { const [a, b] = raw(x, y, z); return [(a - minX) * s + PAD, (b - minY) * s + PAD]; };
    const poly = (pts, fill, stroke) => {
      g.beginPath();
      pts.forEach(([x, y, z], i) => { const [px, py] = P(x, y, z); if (i) g.lineTo(px, py); else g.moveTo(px, py); });
      g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = 0.7; g.stroke(); }
    };
    poly([[0, 0, 0], [L, 0, 0], [L, W, 0], [0, W, 0]], "#202427", "rgba(255,255,255,0.18)");
    poly([[0, 0, 0], [0, W, 0], [0, W, H], [0, 0, H]], "rgba(255,255,255,0.04)", "rgba(255,255,255,0.14)");
    poly([[0, 0, 0], [L, 0, 0], [L, 0, H], [0, 0, H]], "rgba(255,255,255,0.03)", "rgba(255,255,255,0.14)");

    // silindir: çokgenle yaklaşık çizilir; yalnızca izleyiciye bakan yüzler boyanır (dışbükey cisimde sıralama gerekmez)
    const N = 28;
    const drawCyl = (p, base) => {
      const { x, y, z, dx, dy, dz } = p;
      const ring = (a, cx, cy, cz, ra, rb, axis) => (axis === "z" ? [cx + ra * Math.cos(a), cy + rb * Math.sin(a), cz] : axis === "x" ? [cx, cy + ra * Math.cos(a), cz + rb * Math.sin(a)] : [cx + ra * Math.cos(a), cy, cz + rb * Math.sin(a)]);
      const axis = p.kind === "up" ? "z" : p.kind === "lx" ? "x" : "y";
      const len = axis === "z" ? dz : axis === "x" ? dx : dy;
      const R1 = axis === "z" ? dx / 2 : axis === "x" ? dy / 2 : dx / 2, R2 = axis === "z" ? dy / 2 : dz / 2;
      const c = [x + dx / 2, y + dy / 2, z + dz / 2];
      const start = axis === "z" ? z : axis === "x" ? x : y;
      const at = (a, t) => ring(a, c[0], c[1], c[2], R1, R2, axis).map((v, i) => ((axis === "z" && i === 2) || (axis === "x" && i === 0) || (axis === "y" && i === 1) ? start + t : v));
      const view = [1, 1, 1];
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2;
        const n = ring(am, 0, 0, 0, 1, 1, axis); // yüzey normali (çapraz kesit düzleminde)
        const facing = n[0] * view[0] + n[1] * view[1] + n[2] * view[2];
        if (facing <= 0) continue;
        poly([at(a0, 0), at(a1, 0), at(a1, len), at(a0, len)], shade(base, 0.62 + 0.42 * (facing / Math.sqrt(3))), "rgba(0,0,0,0.18)");
      }
      const cap = (t) => poly(Array.from({ length: N }, (_, i) => at((i / N) * Math.PI * 2, t)), shade(base, 1.15), "rgba(0,0,0,0.35)");
      cap(len); // görünen uç: z için üst, x ve y için kapıya / yana bakan uç
    };

    const order = [...placements].sort((a, b) => (a.x + a.y + a.z) - (b.x + b.y + b.z) || a.seq - b.seq);
    for (const p of order) {
      const base = colorOf(p.itemId);
      const { x, y, z, dx, dy, dz } = p;
      if (p.cyl) { drawCyl(p, base); continue; }
      poly([[x, y, z + dz], [x + dx, y, z + dz], [x + dx, y + dy, z + dz], [x, y + dy, z + dz]], shade(base, 1.18), "rgba(0,0,0,0.35)");
      poly([[x + dx, y, z], [x + dx, y + dy, z], [x + dx, y + dy, z + dz], [x + dx, y, z + dz]], shade(base, 0.95), "rgba(0,0,0,0.35)");
      poly([[x, y + dy, z], [x + dx, y + dy, z], [x + dx, y + dy, z + dz], [x, y + dy, z + dz]], shade(base, 0.7), "rgba(0,0,0,0.35)");
    }
    // tavan çerçevesi ve kapı etiketi
    g.strokeStyle = "rgba(255,255,255,0.22)"; g.lineWidth = 1;
    g.beginPath();
    [[[0, 0, H], [L, 0, H]], [[L, 0, H], [L, W, H]], [[L, W, H], [0, W, H]], [[0, W, H], [0, 0, H]], [[L, 0, 0], [L, 0, H]], [[L, W, 0], [L, W, H]], [[0, W, 0], [0, W, H]]].forEach(([a, b]) => {
      const [x1, y1] = P(...a), [x2, y2] = P(...b); g.moveTo(x1, y1); g.lineTo(x2, y2);
    });
    g.stroke();
    if (doorLabel) {
      const [dxp, dyp] = P(L, W / 2, 0);
      g.fillStyle = "rgba(255,255,255,0.6)"; g.font = "600 22px sans-serif"; g.fillText(doorLabel, dxp + 10, dyp + 24);
    }
  }, [container, placements, colorOf, doorLabel]);
  return <canvas ref={ref} className="pl-iso" role="img" aria-label="3D view" />;
}
