/* Konteyner yerleştirme motoru (saf JS, DOM yok).
   Yöntem: uç nokta (extreme point) tabanlı, yükleme sırasıyla art arda yerleştirme.
   Her birim, o ana kadar yerleşenlere göre destek, çakışma ve "kapıya doğru engel yok" kurallarını sağlayan
   en erken (x, z, y) noktaya konur; böylece her plan validate.mjs'ten geçer. */
import { CONTAINERS } from "./containers.mjs";

const EPS = 1e-6;
const BUCKET = 20; // cm; kutular başlangıç (x, y) hücresine göre ızgaraya konur

const crosses = (a0, a1, b0, b1, pad = 0) => a0 < b1 + pad - EPS && b0 < a1 + pad - EPS;
const overlapLen = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

const isCyl = (it) => it.shape === "cyl";
/** Yalnızca zemine konan ve üstüne hiçbir şey konmayan kalem: paletli yük ya da istiflenemez silindir */
export const floorOnly = (it) => !!it.palletized || (isCyl(it) && it.stackable === false);

/** Silindirin yönü: "up" = dik (tepeden daire), "lx"/"ly" = yatık (ekseni x ya da y boyunca) */
export function cylKind(item, dx, dy, dz) {
  const d = item.w;
  if (Math.abs(dx - d) < EPS && Math.abs(dy - d) < EPS) return "up";
  return Math.abs(dy - d) < EPS && Math.abs(dz - d) < EPS ? "lx" : "ly";
}

export function orientationsOf(item) {
  const { l, w, h } = item;
  if (isCyl(item)) {
    const d = w, len = l; // l = boy, w = çap
    const up = [[d, d, len]], lying = [[len, d, d], [d, len, d]];
    const o = item.orient === "up" ? up : item.orient === "lying" ? lying : [...up, ...lying];
    const seen = new Set();
    return o.filter((v) => { const k = v.join("x"); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  const list = item.palletized || item.upright
    ? [[l, w, h], [w, l, h]]
    : [[l, w, h], [l, h, w], [w, l, h], [w, h, l], [h, l, w], [h, w, l]];
  const seen = new Set();
  return list.filter((o) => { const k = o.join("x"); if (seen.has(k)) return false; seen.add(k); return true; });
}

const sameFoot = (e, x, y, dx, dy) => Math.abs(e.x - x) < EPS && Math.abs(e.y - y) < EPS && Math.abs(e.dx - dx) < EPS && Math.abs(e.dy - dy) < EPS;

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
    this.version = 0; // her yerleşimde artar: "bu birim buraya sığmadı" bilgisi yalnız aynı sürümde geçerli
  }

  fits(px, py, pz, dx, dy, dz, pallet, circ = false, cyl = false) {
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
          const xy = circ && e.circ
            ? Math.hypot(px + dx / 2 - (e.x + e.dx / 2), py + dy / 2 - (e.y + e.dy / 2)) < (dx + e.dx) / 2 + gap - EPS
            : crosses(px, px + dx, e.x, e.x + e.dx, gap) && crosses(py, py + dy, e.y, e.y + e.dy, gap);
          if (xy && crosses(pz, pz + dz, e.z, e.z + e.dz)) return false;
          if (pz > EPS && !e.pallet && Math.abs(e.z + e.dz - pz) < EPS) {
            // silindir yalnızca aynı ayak izine sahip silindirin üstünde durur; düz kutu üstüne herkes konabilir
            if (e.cyl) {
              if (cyl && sameFoot(e, px, py, dx, dy)) area += dx * dy;
            } else {
              area += overlapLen(px, px + dx, e.x, e.x + e.dx) * overlapLen(py, py + dy, e.y, e.y + e.dy);
            }
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
    const pallet = floorOnly(item);
    const cyl = isCyl(item);
    const tight = cyl && item.tight !== false;
    for (const pt of this.points) {
      if (pallet && pt.z > EPS) continue;
      let best = null;
      for (const [dx, dy, dz] of orients) {
        const circ = tight && cylKind(item, dx, dy, dz) === "up";
        if (!this.fits(pt.x, pt.y, pt.z, dx, dy, dz, pallet, circ, cyl)) continue;
        if (!best || dx < best[0] - EPS || (Math.abs(dx - best[0]) < EPS && dz < best[2] - EPS)) best = [dx, dy, dz, circ];
      }
      if (best) return this.commit(item, pt, best, pallet);
    }
    return null;
  }

  commit(item, pt, [dx, dy, dz, circ], pallet) {
    const p = { itemId: item.id, x: pt.x, y: pt.y, z: pt.z, dx, dy, dz, pallet, seq: this.placements.length + 1 };
    if (isCyl(item)) { p.cyl = true; p.kind = cylKind(item, dx, dy, dz); if (circ) p.circ = true; }
    this.placements.push(p);
    this.version++;
    const bx = Math.floor(p.x / BUCKET);
    this.grid[bx][Math.floor(p.y / BUCKET)].push(p);
    this.maxDx = Math.max(this.maxDx, dx);
    this.maxDy = Math.max(this.maxDy, dy);
    this.maxBx = Math.max(this.maxBx, bx);
    this.usedVolume += dx * dy * dz;
    this.weight += item.weight || 0;

    // yeni kutunun içinde kalan noktaları sil
    // dairesel (zikzak) silindirin kutusu içindeki noktalar silinmez: komşu daire kutunun içine, daire dışına düşebilir
    if (!p.circ) this.points = this.points.filter((q) => {
      const inside = q.x >= p.x - EPS && q.x < p.x + dx - EPS && q.y >= p.y - EPS && q.y < p.y + dy - EPS && q.z >= p.z - EPS && q.z < p.z + dz - EPS;
      if (inside) this.pointKeys.delete(`${q.x},${q.y},${q.z}`);
      return !inside;
    });
    const g = this.gap;
    const cands = [{ x: p.x + dx + g, y: p.y, z: p.z }, { x: p.x, y: p.y + dy + g, z: p.z }];
    if (!pallet) cands.push({ x: p.x, y: p.y, z: p.z + dz });
    if (p.circ && p.z < EPS) {
      // altıgen dizilim: komşu daire, merkezler arası (çap + boşluk) uzaklıkta 30° ve 60° açılarda
      const s = dx + g, h = (s * Math.sqrt(3)) / 2;
      cands.push({ x: p.x + h, y: p.y + s / 2, z: p.z }, { x: p.x + h, y: p.y - s / 2, z: p.z }, { x: p.x + s / 2, y: p.y + h, z: p.z }, { x: p.x - s / 2, y: p.y + h, z: p.z });
    }
    for (const c of cands) this.addPoint(c);
    return p;
  }

  addPoint(c) {
    const { C } = this;
    if (c.x < -EPS || c.y < -EPS || c.x >= C.L - EPS || c.y >= C.W - EPS || c.z >= C.H - EPS) return;
    const key = `${c.x},${c.y},${c.z}`;
    if (this.pointKeys.has(key)) return;
    const bxLo = Math.max(0, Math.floor((c.x - this.maxDx) / BUCKET)), bxHi = Math.min(this.nx - 1, Math.floor(c.x / BUCKET));
    const byLo = Math.max(0, Math.floor((c.y - this.maxDy) / BUCKET)), byHi = Math.min(this.ny - 1, Math.floor(c.y / BUCKET));
    for (let bx = bxLo; bx <= bxHi; bx++) {
      for (let by = byLo; by <= byHi; by++) {
        for (const e of this.grid[bx][by]) {
          if (e.circ) continue;
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

const faceArea = (it) => (isCyl(it) ? Math.max(it.w * it.w, it.l * it.w) : it.palletized || it.upright ? it.l * it.w : Math.max(it.l * it.w, it.l * it.h, it.w * it.h));

/** Silindir varsa birkaç aday plan dener ve en iyisini döndürür: "yön fark etmez" kalemler için planlayıcının seçimi / hep dik / hep yatık,
 *  zikzak açık kalemler için zikzaklı / düz ızgara (zikzak her ölçüde kazandırmaz). Aday sırası eşitlikte ilk gelen kazanır. */
export function planLoad(items, containerKey, opts = {}) {
  const C = CONTAINERS[containerKey];
  const { list, result } = bestCylVariant(items, containerKey, opts);
  result.orders = ["group"];
  // Kalemleri karışık dizme: aynı yük birkaç sırayla denenir, en çok istif yapan seçilir; eşitlikte bugünkü gruplu sıra kalır.
  // Başka sıranın kazanamayacağı durumlarda denenmez: tek kalem, hesap sınırına takılmış, her şey tek konteynere sığmış.
  const fixed = fixedOf(list);
  if (fixed.length < 2 || result.capped) return result;
  if (!result.fill && !result.unplaced.length && result.containers.length <= 1) return result;
  const index = new Map(fixed.map((it, i) => [it, i]));
  const seqKey = (order) => unitRuns(fixed, order).map((r) => index.get(r.item)).join(",");
  const seen = new Set([seqKey("group")]), orders = ["group"];
  let best = result;
  for (const order of ORDERS.slice(1)) {
    const k = seqKey(order);
    if (seen.has(k)) continue; // aynı kalem dizisi aynı sonucu verir
    seen.add(k); orders.push(order);
    const r = planOnce(list, containerKey, { ...opts, order });
    if (betterLoad(r, best, C)) best = r;
  }
  best.orders = orders;
  return best;
}

/** Diziliş sırası karşılaştırması: sığmayan en az → konteyner en az → dolgu en çok → konteyner hacimleri sırayla en dolu.
 *  Hacim farkı konteyner hacminin %1'inden azsa eşit sayılır (küçük kazanç için düzenli gruplu plan bozulmasın). */
export function betterLoad(a, b, C) {
  const count = (r) => [r.unplaced.reduce((n, u) => n + u.count, 0), r.containers.length, -(r.fill?.count ?? 0)];
  const x = count(a), y = count(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i];
  const tol = 0.01 * C.L * C.W * C.H;
  for (let i = 0; i < a.containers.length; i++) {
    const d = a.containers[i].usedVolumeCm3 - (b.containers[i]?.usedVolumeCm3 ?? 0);
    if (Math.abs(d) >= tol) return d > 0;
  }
  return false;
}

/** Silindirli yüklerde yön/zikzak adaylarından en iyisi (gruplu sırayla); { list: kullanılan kalem listesi, result } */
function bestCylVariant(items, containerKey, opts) {
  const flexible = items.some((it) => isCyl(it) && (it.orient || "any") === "any");
  const tightAny = items.some((it) => isCyl(it) && it.tight !== false);
  if (!flexible && !tightAny) return { list: items, result: planOnce(items, containerKey, opts) };
  const variant = (orient, flat) => items.map((it) => {
    if (!isCyl(it)) return it;
    const o = { ...it };
    if (orient && (it.orient || "any") === "any") o.orient = orient;
    if (flat) o.tight = false;
    return o;
  });
  const lists = [];
  for (const orient of flexible ? [null, "up", "lying"] : [null]) for (const flat of tightAny ? [false, true] : [false]) lists.push(variant(orient, flat));
  const cands = lists.map((list) => ({ list, result: planOnce(list, containerKey, opts) }));
  const score = (r) => [r.unplaced.reduce((n, u) => n + u.count, 0), r.containers.length, -(r.fill?.count ?? 0)];
  const better = (a, b) => { const x = score(a), y = score(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false; };
  return cands.reduce((best, c) => (better(c.result, best.result) ? c : best));
}

/** Diziliş sıraları: group = yalnız-zemin önce, ayak izi büyük önce (ilk aday, eşitlikte kazanır);
 *  volume = birim hacmi büyükten küçüğe; height = yükseklik büyükten küçüğe (silindirde çap).
 *  Kalemleri birer birer dönüşümlü dizmek denendi (2026-11-27): 240 rastgele yükün 13'ünde az farkla kazandı, hiç konteyner
 *  kazandırmadı, hesabı ~10 kat uzattı → aday değil. Yalnız-zemin paletlerin önce gelmemesi asıl kazancı sağlıyor. */
export const ORDERS = ["group", "volume", "height"];
const unitVolume = (it) => (isCyl(it) ? Math.PI * (it.w / 2) ** 2 * it.l : it.l * it.w * it.h);
const unitHeight = (it) => (isCyl(it) ? it.w : it.h);

/** Adetli kalemler, gruplu sırada: yalnız-zemin önce, ayak izi büyük önce, eşitlikte girdi sırası */
function fixedOf(items) {
  return items
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => it.qty !== null && it.qty > 0)
    .sort((a, b) => (Number(floorOnly(b.it)) - Number(floorOnly(a.it))) || (faceArea(b.it) - faceArea(a.it)) || (a.i - b.i))
    .map(({ it }) => it);
}

/** Kalemleri (gruplu sırada) yerleştirme dizisine çevirir: [{ item, n }] — n art arda konacak birim sayısı */
function unitRuns(fixed, order) {
  const byKey = (f) => fixed.map((it, i) => ({ it, i })).sort((a, b) => (f(b.it) - f(a.it)) || (a.i - b.i)).map(({ it }) => ({ item: it, n: it.qty }));
  if (order === "volume") return byKey(unitVolume);
  if (order === "height") return byKey(unitHeight);
  return fixed.map((it) => ({ item: it, n: it.qty }));
}

export function planOnce(items, containerKey, opts = {}) {
  const C = CONTAINERS[containerKey];
  if (!C) throw new Error(`unknown container: ${containerKey}`);
  const gap = opts.gap || 0;
  const maxUnits = opts.maxUnits ?? DEFAULT_MAX_UNITS;
  const maxWork = opts.maxWork ?? DEFAULT_MAX_WORK;
  const budget = { work: 0 }; // incelenen kutu sayısı (hücre taramaları): süre yerine sayaç, böylece sonuç deterministik kalır

  const fills = items.filter((it) => it.qty === null);
  if (fills.length > 1) throw new Error("only one fill item is allowed");
  const fixed = fixedOf(items);

  const bins = [];
  const unplaced = [];
  const addUnplaced = (itemId, count, reason) => {
    const row = unplaced.find((u) => u.itemId === itemId && u.reason === reason);
    if (row) row.count += count; else unplaced.push({ itemId, count, reason });
  };
  let placedTotal = 0;
  let capped = false;
  const over = () => placedTotal >= maxUnits || budget.work > maxWork;

  const left = new Map(fixed.map((it) => [it, it.qty])); // kalem başına konmamış birim
  const done = new Set(); // sığmayan/çok büyük: kalanı raporlandı
  const failed = new Map(); // kalem → Map<konteyner sırası, sürüm>: o sürümde bu kalemin birimi sığmadı
  for (const { item, n } of unitRuns(fixed, opts.order || "group")) {
    if (done.has(item)) continue;
    const orients = orientationsOf(item);
    if (!fitsEmpty(orients, C)) { addUnplaced(item.id, left.get(item), "too_big"); done.add(item); continue; }
    if (!failed.has(item)) failed.set(item, new Map());
    const miss = failed.get(item);
    for (let u = 0; u < n; u++) {
      if (over()) { addUnplaced(item.id, left.get(item), "cap"); capped = true; done.add(item); break; }
      let placed = null;
      for (let bi = 0; bi < bins.length && !placed; bi++) {
        if (miss.get(bi) === bins[bi].version) continue;
        placed = bins[bi].tryPlace(item, orients);
        if (!placed) miss.set(bi, bins[bi].version);
      }
      if (!placed) {
        const bin = new Bin(C, gap, bins.length, budget);
        bins.push(bin);
        placed = bin.tryPlace(item, orients);
      }
      if (!placed) { addUnplaced(item.id, left.get(item), "no_space"); done.add(item); break; }
      left.set(item, left.get(item) - 1);
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
