/* Bir yerleşim planının kurallara uygunluğunu denetler; motorun ve testlerin hakemidir. */
const EPS = 1e-6;

// [a0,a1) ve [b0,b1) aralıkları, aralarında en az `pad` boşluk bırakılmadan kesişiyor mu
const crosses = (a0, a1, b0, b1, pad = 0) => a0 < b1 + pad - EPS && b0 < a1 + pad - EPS;
const overlapLen = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

export function validatePlan(container, placements, opts = {}) {
  const gap = opts.gap || 0;
  const errors = [];
  const P = placements;
  const name = (p) => `#${p.seq}(${p.itemId})`;

  for (const p of P) {
    if (p.x < -EPS || p.y < -EPS || p.z < -EPS || p.x + p.dx > container.L + EPS || p.y + p.dy > container.W + EPS || p.z + p.dz > container.H + EPS) {
      errors.push(`${name(p)} outside container`);
    }
  }

  const seqs = new Set();
  for (const p of P) {
    if (seqs.has(p.seq)) errors.push(`${name(p)} duplicate seq`);
    seqs.add(p.seq);
  }

  for (let i = 0; i < P.length; i++) {
    for (let j = i + 1; j < P.length; j++) {
      const a = P[i], b = P[j];
      if (!crosses(a.z, a.z + a.dz, b.z, b.z + b.dz)) continue; // dikey temas serbest
      if (crosses(a.x, a.x + a.dx, b.x, b.x + b.dx, gap) && crosses(a.y, a.y + a.dy, b.y, b.y + b.dy, gap)) {
        errors.push(`${name(a)} overlaps ${name(b)}`);
      }
    }
  }

  const supportersOf = (q) => P.filter((s) => s !== q && Math.abs(s.z + s.dz - q.z) < EPS && crosses(s.x, s.x + s.dx, q.x, q.x + q.dx) && crosses(s.y, s.y + s.dy, q.y, q.y + q.dy));

  for (const q of P) {
    for (const s of supportersOf(q)) {
      if (s.pallet) errors.push(`${name(q)} on top of pallet ${name(s)}`);
    }
    if (q.z < EPS) continue;
    const area = supportersOf(q).reduce((sum, s) => sum + overlapLen(q.x, q.x + q.dx, s.x, s.x + s.dx) * overlapLen(q.y, q.y + q.dy, s.y, s.y + s.dy), 0);
    if (area < q.dx * q.dy - 1e-4) errors.push(`${name(q)} lacks full support`);
  }

  const bySeq = [...P].sort((a, b) => a.seq - b.seq);
  for (let i = 0; i < bySeq.length; i++) {
    const q = bySeq[i];
    for (const s of supportersOf(q)) {
      if (s.seq > q.seq) errors.push(`${name(q)} loaded before its support ${name(s)} (order)`);
    }
    for (let j = 0; j < i; j++) {
      const e = bySeq[j];
      if (crosses(e.y, e.y + e.dy, q.y, q.y + q.dy) && crosses(e.z, e.z + e.dz, q.z, q.z + q.dz) && e.x >= q.x + q.dx - EPS) {
        errors.push(`${name(e)} loaded earlier but nearer the door than ${name(q)} (order)`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
