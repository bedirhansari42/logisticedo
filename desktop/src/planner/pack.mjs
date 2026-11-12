/* Konteyner yerleştirme motoru (saf JS, DOM yok).
   Yöntem: uç nokta (extreme point) tabanlı, yükleme sırasıyla art arda yerleştirme.
   Her birim, o ana kadar yerleşenlere göre destek, çakışma ve "kapıya doğru engel yok" kurallarını sağlayan
   en erken (x, z, y) noktaya konur; böylece her plan validate.mjs'ten geçer. */
import { CONTAINERS } from "./containers.mjs";

const EPS = 1e-6;
const BUCKET = 20; // cm; kutular başlangıç (x, y) hücresine göre ızgaraya konur

const crosses = (a0, a1, b0, b1, pad = 0) => a0 < b1 + pad - EPS && b0 < a1 + pad - EPS;
const overlapLen = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

export function orientationsOf(item) {
  const { l, w, h } = item;
  const list = item.palletized || item.upright
    ? [[l, w, h], [w, l, h]]
    : [[l, w, h], [l, h, w], [w, l, h], [w, h, l], [h, l, w], [h, w, l]];
  const seen = new Set();
  return list.filter((o) => { const k = o.join("x"); if (seen.has(k)) return false; seen.add(k); return true; });
}

const fitsEmpty = (orients, C) => orients.some(([dx, dy, dz]) => dx <= C.L + EPS && dy <= C.W + EPS && dz <= C.H + EPS);

class Bin {
  constructor(C, gap, index, budget) {
    this.C = C; this.gap = gap; this.index = index; this.budget = budget;
    this.placements = [];
    this.nx = Math.ceil(C.L / BUCKET) + 1;
    this.ny = Math.ceil(C.W / BUCKET) + 1;
    this.grid = Array.from({ length: this.nx }, () => Array.from({ length: this.ny }, () => []));
    this.maxDx = 0;
    this.maxDy = 0;
    this.maxBx = 0;
    this.points = [{ x: 0, y: 0, z: 0 }];
    this.pointKeys = new Set(["0,0,0"]);
    this.usedVolume = 0;
    this.weight = 0;
  }

  fits(px, py, pz, dx, dy, dz, pallet) {
    const { C, gap } = this;
    if (px + dx > C.L + EPS || py + dy > C.W + EPS || pz + dz > C.H + EPS) return false;
    if (pallet && pz > EPS) return false;
    let area = 0;
    const bxLo = Math.max(0, Math.floor((px - gap - this.maxDx) / BUCKET)), bxHi = Math.min(this.nx - 1, Math.floor((px + dx + gap) / BUCKET));
    const byLo = Math.max(0, Math.floor((py - gap - this.maxDy) / BUCKET)), byHi = Math.min(this.ny - 1, Math.floor((py + dy + gap) / BUCKET));
    for (let bx = bxLo; bx <= bxHi; bx++) {
      const col = this.grid[bx];
      for (let by = byLo; by <= byHi; by++) {
        const cell = col[by];
        this.budget.work += cell.length + 1;
        for (let k = 0; k < cell.length; k++) {
          const e = cell[k];
          const xy = crosses(px, px + dx, e.x, e.x + e.dx, gap) && crosses(py, py + dy, e.y, e.y + e.dy, gap);
          if (xy && crosses(pz, pz + dz, e.z, e.z + e.dz)) return false;
          if (pz > EPS && !e.pallet && Math.abs(e.z + e.dz - pz) < EPS) {
            area += overlapLen(px, px + dx, e.x, e.x + e.dx) * overlapLen(py, py + dy, e.y, e.y + e.dy);
          }
        }
      }
    }
    if (pz > EPS && area < dx * dy - 1e-4) return false;
    // kapıya doğru engel yok: daha önce konanlardan hiçbiri y/z'de kesişip kapı yönünde olmamalı
    for (let bx = Math.max(0, Math.floor((px + dx - EPS) / BUCKET)); bx <= this.maxBx; bx++) {
      const col = this.grid[bx];
      for (let by = byLo; by <= byHi; by++) {
        const cell = col[by];
        this.budget.work += cell.length + 1;
        for (let k = 0; k < cell.length; k++) {
          const e = cell[k];
          if (e.x >= px + dx - EPS && crosses(e.y, e.y + e.dy, py, py + dy) && crosses(e.z, e.z + e.dz, pz, pz + dz)) return false;
        }
      }
    }
    return true;
  }

  tryPlace(item, orients) {
    const pallet = !!item.palletized;
    for (const pt of this.points) {
      if (pallet && pt.z > EPS) continue;
      let best = null;
      for (const [dx, dy, dz] of orients) {
        if (!this.fits(pt.x, pt.y, pt.z, dx, dy, dz, pallet)) continue;
        if (!best || dx < best[0] - EPS || (Math.abs(dx - best[0]) < EPS && dz < best[2] - EPS)) best = [dx, dy, dz];
      }
      if (best) return this.commit(item, pt, best, pallet);
    }
    return null;
  }

  commit(item, pt, [dx, dy, dz], pallet) {
    const p = { itemId: item.id, x: pt.x, y: pt.y, z: pt.z, dx, dy, dz, pallet, seq: this.placements.length + 1 };
    this.placements.push(p);
    const bx = Math.floor(p.x / BUCKET);
    this.grid[bx][Math.floor(p.y / BUCKET)].push(p);
    this.maxDx = Math.max(this.maxDx, dx);
    this.maxDy = Math.max(this.maxDy, dy);
    this.maxBx = Math.max(this.maxBx, bx);
    this.usedVolume += dx * dy * dz;
    this.weight += item.weight || 0;

    // yeni kutunun içinde kalan noktaları sil
    this.points = this.points.filter((q) => {
      const inside = q.x >= p.x - EPS && q.x < p.x + dx - EPS && q.y >= p.y - EPS && q.y < p.y + dy - EPS && q.z >= p.z - EPS && q.z < p.z + dz - EPS;
      if (inside) this.pointKeys.delete(`${q.x},${q.y},${q.z}`);
      return !inside;
    });
    const g = this.gap;
    const cands = [{ x: p.x + dx + g, y: p.y, z: p.z }, { x: p.x, y: p.y + dy + g, z: p.z }];
    if (!pallet) cands.push({ x: p.x, y: p.y, z: p.z + dz });
    for (const c of cands) this.addPoint(c);
    return p;
  }

  addPoint(c) {
    const { C } = this;
    if (c.x >= C.L - EPS || c.y >= C.W - EPS || c.z >= C.H - EPS) return;
    const key = `${c.x},${c.y},${c.z}`;
    if (this.pointKeys.has(key)) return;
    const bxLo = Math.max(0, Math.floor((c.x - this.maxDx) / BUCKET)), bxHi = Math.min(this.nx - 1, Math.floor(c.x / BUCKET));
    const byLo = Math.max(0, Math.floor((c.y - this.maxDy) / BUCKET)), byHi = Math.min(this.ny - 1, Math.floor(c.y / BUCKET));
    for (let bx = bxLo; bx <= bxHi; bx++) {
      for (let by = byLo; by <= byHi; by++) {
        for (const e of this.grid[bx][by]) {
          if (c.x >= e.x - EPS && c.x < e.x + e.dx - EPS && c.y >= e.y - EPS && c.y < e.y + e.dy - EPS && c.z >= e.z - EPS && c.z < e.z + e.dz - EPS) return;
        }
      }
    }
    this.pointKeys.add(key);
    // (x, z, y) sırasıyla sıralı ekleme
    let lo = 0, hi = this.points.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1, q = this.points[m];
      if (q.x < c.x || (q.x === c.x && (q.z < c.z || (q.z === c.z && q.y < c.y)))) lo = m + 1; else hi = m;
    }
    this.points.splice(lo, 0, c);
  }

  summary() {
    const vol = this.C.L * this.C.W * this.C.H;
    return {
      index: this.index,
      placements: this.placements,
      usedVolumeCm3: this.usedVolume,
      fillPct: Math.round((this.usedVolume / vol) * 100 * 10) / 10,
      weightKg: Math.round(this.weight * 1000) / 1000
    };
  }
}

/** Üç konteyner tipi için bağımsız plan */
export function planAll(items, opts = {}) {
  return { "20": planLoad(items, "20", opts), "40": planLoad(items, "40", opts), "40hc": planLoad(items, "40hc", opts) };
}

export const DEFAULT_MAX_UNITS = 20000;
export const DEFAULT_MAX_WORK = 800_000_000; // fits() çağrısı; bu sınır aşılınca kalan birimler "cap" olarak raporlanır

const faceArea =(it) => (it.palletized || it.upright ? it.l * it.w : Math.max(it.l * it.w, it.l * it.h, it.w * it.h));

export function planLoad(items, containerKey, opts = {}) {
  const C = CONTAINERS[containerKey];
  if (!C) throw new Error(`unknown container: ${containerKey}`);
  const gap = opts.gap || 0;
  const maxUnits = opts.maxUnits ?? DEFAULT_MAX_UNITS;
  const maxWork = opts.maxWork ?? DEFAULT_MAX_WORK;
  const budget = { work: 0 }; // incelenen kutu sayısı (hücre taramaları): süre yerine sayaç, böylece sonuç deterministik kalır

  const fills = items.filter((it) => it.qty === null);
  if (fills.length > 1) throw new Error("only one fill item is allowed");
  const fixed = items
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => it.qty !== null && it.qty > 0)
    .sort((a, b) => (Number(!!b.it.palletized) - Number(!!a.it.palletized)) || (faceArea(b.it) - faceArea(a.it)) || (a.i - b.i))
    .map(({ it }) => it);

  const bins = [];
  const unplaced = [];
  const addUnplaced = (itemId, count, reason) => {
    const row = unplaced.find((u) => u.itemId === itemId && u.reason === reason);
    if (row) row.count += count; else unplaced.push({ itemId, count, reason });
  };
  let placedTotal = 0;
  let capped = false;
  const over = () => placedTotal >= maxUnits || budget.work > maxWork;

  for (const item of fixed) {
    const orients = orientationsOf(item);
    if (!fitsEmpty(orients, C)) { addUnplaced(item.id, item.qty, "too_big"); continue; }
    const failed = new Set();
    for (let u = 0; u < item.qty; u++) {
      if (over()) { addUnplaced(item.id, item.qty - u, "cap"); capped = true; break; }
      let placed = null;
      for (let bi = 0; bi < bins.length && !placed; bi++) {
        if (failed.has(bi)) continue;
        placed = bins[bi].tryPlace(item, orients);
        if (!placed) failed.add(bi);
      }
      if (!placed) {
        const bin = new Bin(C, gap, bins.length, budget);
        bins.push(bin);
        placed = bin.tryPlace(item, orients);
      }
      if (!placed) { addUnplaced(item.id, item.qty - u, "no_space"); break; }
      placedTotal++;
    }
  }

  let fill = null;
  if (fills.length) {
    const f = fills[0];
    const orients = orientationsOf(f);
    fill = { itemId: f.id, count: 0 };
    if (!fitsEmpty(orients, C)) {
      addUnplaced(f.id, 0, "too_big");
      fill.reason = "too_big";
    } else {
      if (!bins.length) bins.push(new Bin(C, gap, 0, budget));
      while (!over()) {
        if (!bins[0].tryPlace(f, orients)) break;
        fill.count++;
        placedTotal++;
      }
      if (over()) capped = true;
      if (fill.count === 0 && !capped) fill.reason = "first_full";
    }
  }

  return { containerKey, containers: bins.map((b) => b.summary()), unplaced, fill, capped, work: budget.work };
}
