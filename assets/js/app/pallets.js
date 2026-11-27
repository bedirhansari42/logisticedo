/* Paletler: kalemlere bağlı içerik satırları için saf hesaplar (DOM yok). PDF, etiketler ve masaüstü arayüzü kullanır.
   Palet = { id, no, type, dimensions, net, gross, contents (not), lines: [{ id, itemId, cartons, qty }] }.
   Boş bırakılan miktar ve ağırlıklar kalemlerden önerilir (kalemin kap/miktar payına göre). */
import { num, round, uid, toInput, newPallet, newPalletLine, packagesText, packagesInWords, packageTypeLabel, palletVolume } from "./doc-model.js";

const n = (v) => { const x = num(v); return Number.isFinite(x) ? x : null; };
const pos = (v) => { const x = n(v); return x != null && x > 0 ? x : null; };
/** Elle girilen miktar/ağırlık: eksi değer girilmemiş sayılır (öneri devralır) */
const nonneg = (v) => { const x = n(v); return x != null && x >= 0 ? x : null; };
const str = (v) => (v == null ? "" : typeof v === "string" ? v : String(v));
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const tidy = (v) => (Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : round(v, 3));

/** Belgeye basılan (dolu) kalemler: açıklaması ya da miktarı olanlar */
export const realItems = (s) => (s.items || []).filter((it) => it.description || it.qty);
const itemMap = (s) => new Map((s.items || []).map((it) => [it.id, it]));
/** Yalnız dolu kalemler: içeriği boşaltılmış kalemin satırı sahipsiz sayılır, basılmaz */
const realMap = (s) => new Map(realItems(s).map((it) => [it.id, it]));
/** Dağıtılacak kalemler: miktarı ya da kap sayısı olanlar (yalnız açıklamalı başlık satırları sayılmaz) */
const measurable = (it) => n(it.qty) != null || pos(it.packages) != null;
/** Satırın kap sayısı (tam sayı, > 0) ya da null; küsuratlı kap geçersizdir (yuvarlanmaz) */
export const lineCartons = (line) => { const c = pos(line.cartons); return c != null && Number.isInteger(c) ? c : null; };

/** Form girişi temizleyicileri: kap sayısı yalnız rakam, miktar/ağırlık rakam ve ondalık ayırıcı (eksi yok) */
export const cleanCartons = (raw) => str(raw).replace(/\D/g, "");
export const cleanAmount = (raw) => str(raw).replace(/[^\d.,]/g, "");

/** Hiç dokunulmamış palet (içerik, ölçü, ağırlık, not yok): sorulmadan silinebilir */
export const palletIsBlank = (p) => !(p.lines || []).length && ![p.dimensions, p.net, p.gross, p.contents].some((v) => str(v).trim());

/** Palet cinsinin tekil hâli (başlık satırı "PALLET 1" için): PALLETS → PALLET, BOXES → BOX, GLASS → GLASS */
export function palletTypeWord(type) {
  const t = str(type).trim().toUpperCase();
  if (/(X|CH|SH|SS)ES$/.test(t)) return t.slice(0, -2);
  if (/[^S]S$/.test(t)) return t.slice(0, -1);
  return t;
}

/** Paletin belgeye basılan satırları (kalemi dolu olanlar) */
export function linkedLines(s, p) {
  const items = realMap(s);
  return (p.lines || []).filter((l) => items.has(l.itemId));
}

/** Kayıttan/yedekten gelen palet listesini güncel şekle getirir; bozuk paletler ve satırlar düşer, eski içerik metni korunur */
export function normalizePallets(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).map((p) => newPallet({
    ...(typeof p.id === "string" && p.id ? { id: p.id } : {}),
    no: str(p.no), type: p.type == null ? "PALLET" : str(p.type), contents: str(p.contents), dimensions: str(p.dimensions), net: str(p.net), gross: str(p.gross),
    lines: (Array.isArray(p.lines) ? p.lines : []).filter((l) => isObj(l) && typeof l.itemId === "string" && l.itemId).map((l) => newPalletLine({
      ...(typeof l.id === "string" && l.id ? { id: l.id } : {}), itemId: l.itemId, cartons: str(l.cartons), qty: str(l.qty), cno: str(l.cno)
    }))
  }));
}

/** Satırın miktarı: girilen; yoksa kalemin miktarından kap payıyla önerilen */
export function lineQty(s, line, item = itemMap(s).get(line.itemId)) {
  const q = nonneg(line.qty);
  if (q != null) return { value: q, suggested: false };
  const iq = n(item?.qty), pk = pos(item?.packages), c = lineCartons(line);
  if (iq == null || !pk || !c) return { value: null, suggested: false };
  // Kalemin önerilen satırları sırayla birikimli yuvarlanır: hepsi dağıtılınca toplam kalem miktarını tam tutar.
  // Kalem miktarı tam sayıysa (adet gibi) öneriler de tam sayı, değilse 3 ondalık.
  const ls = linesOf(s, item.id), at = ls.findIndex((l) => l.id === line.id);
  const before = ls.slice(0, Math.max(0, at)).reduce((a, l) => a + (nonneg(l.qty) == null ? lineCartons(l) || 0 : 0), 0);
  const dec = Number.isInteger(iq) ? 0 : 3;
  const cum = (k) => round((iq * k) / pk, dec);
  return { value: tidy(cum(before + c) - cum(before)), suggested: true };
}

/** Satırın kalemden payı (0..1+): kap oranı, yoksa miktar oranı */
function share(s, line, item) {
  const pk = pos(item.packages), c = lineCartons(line);
  if (pk && c) return c / pk;
  const lq = lineQty(s, line, item).value, iq = pos(item.qty);
  return lq != null && iq ? lq / iq : null;
}

/** Palet ağırlığı (kind: "net" | "gross"): girilen; yoksa satırların kalem ağırlığından payı */
export function palletWeight(s, p, kind) {
  const v = nonneg(p[kind]);
  if (v != null) return { value: v, suggested: false };
  const items = realMap(s);
  const field = kind === "net" ? "netWeight" : "grossWeight";
  /** Paletin kalem kalem yuvarlanmamış ağırlık payı */
  const parts = (q) => {
    const m = new Map();
    for (const l of q.lines || []) {
      const it = items.get(l.itemId);
      if (!it) continue;
      const sh = share(s, l, it), w = n(it[field]);
      if (sh == null || w == null) continue;
      m.set(it.id, (m.get(it.id) || 0) + sh * w);
    }
    return m;
  };
  const mine = parts(p);
  if (!mine.size) return { value: null, suggested: false };
  // Önceki önerili paletlerin payı: kalem başına birikimli yuvarlama, önerilerin toplamı kalem ağırlığını tam tutar
  const pals = s.pallets || [], at = pals.findIndex((q) => q.id === p.id), before = new Map();
  for (const q of pals.slice(0, Math.max(0, at))) {
    if (nonneg(q[kind]) != null) continue;
    for (const [k, x] of parts(q)) before.set(k, (before.get(k) || 0) + x);
  }
  let sum = 0;
  for (const [k, x] of mine) { const b = before.get(k) || 0; sum += round(b + x, 2) - round(b, 2); }
  return { value: round(sum, 2), suggested: true };
}

/** Kap numaraları (C/No.): elle yazılan değer ya da paletler boyunca süren otomatik aralık.
    Elle değer bir sayıyla bitiyorsa ("101-105") sonraki otomatik numaralar oradan sürer.
    Map<satır kimliği, { value: "1-5", suggested }> */
export function cartonNumbers(s) {
  const items = realMap(s), out = new Map();
  let k = 0;
  for (const p of s.pallets || []) for (const l of p.lines || []) {
    if (!items.has(l.itemId)) continue;
    const c = lineCartons(l), typed = str(l.cno).trim();
    if (typed) {
      out.set(l.id, { value: typed, suggested: false });
      const end = typed.match(/(\d+)\s*$/);
      k = end ? Number(end[1]) : k + (c || 0);
      continue;
    }
    if (!c) continue;
    const a = k + 1; k += c;
    out.set(l.id, { value: a === k ? String(a) : `${a}-${k}`, suggested: true });
  }
  return out;
}

const linesOf = (s, itemId) => (s.pallets || []).flatMap((p) => (p.lines || []).filter((l) => l.itemId === itemId));

/** Kalem başına dağıtım: kap ve miktar toplamı ↔ paletlere konan. Kaplar tutsa bile miktar tutmuyorsa o da bildirilir
    (basis: uyuşmazlığın hangi sayıda olduğu — "cartons" | "qty"). */
export function allocation(s) {
  return realItems(s).filter(measurable).map((it) => {
    const ls = linesOf(s, it.id);
    const cartons = { total: pos(it.packages) != null ? Math.round(pos(it.packages)) : null, assigned: ls.reduce((a, l) => a + (lineCartons(l) || 0), 0) };
    const qty = { total: n(it.qty), assigned: round(ls.reduce((a, l) => a + (lineQty(s, l, it).value || 0), 0), 6) };
    const cmp = (a, t) => (Math.abs(a - t) < 1e-9 ? "ok" : a < t ? "under" : "over");
    const byCtn = cartons.total != null ? cmp(cartons.assigned, cartons.total) : null;
    const byQty = qty.total != null ? cmp(qty.assigned, qty.total) : null;
    let status, basis;
    if (byCtn && byCtn !== "ok") { status = byCtn; basis = "cartons"; }
    else if (byQty && byQty !== "ok") { status = byQty; basis = "qty"; }
    else if (byCtn || byQty) { status = "ok"; basis = byCtn ? "cartons" : "qty"; }
    else { status = ls.length ? "ok" : "under"; basis = "qty"; }
    return { itemId: it.id, cartons, qty, status, basis };
  });
}

/** Kalemi silinmiş ya da içeriği boşaltılmış satırların kimlikleri */
export function orphanLines(s) {
  const items = realMap(s);
  return (s.pallets || []).flatMap((p) => (p.lines || []).filter((l) => !items.has(l.itemId)).map((l) => l.id));
}

/** Belge durumu: palet yok → empty; eksik/fazla dağıtım ya da sahipsiz satır → partial; aksi → ready */
export function palletStatus(s) {
  if (!(s.pallets || []).length) return "empty";
  if (orphanLines(s).length || allocation(s).some((a) => a.status !== "ok")) return "partial";
  return "ready";
}

/** Kap cinsi sözcüğü (çoğul, büyük harf): dolu kalemlerin tek ortak cinsi, değilse PACKAGES */
export function packageWord(s) {
  const def = str(s.packing?.packageType);
  const set = new Set(realItems(s).map((it) => (str(it.packageType).trim() || def.trim()).toUpperCase()).filter(Boolean).map((t) => (t.endsWith("S") ? t : `${t}S`)));
  return set.size === 1 ? [...set][0] : "PACKAGES";
}

/** Kalemin henüz palete konmamış kısmı: { cartons } ya da { qty } (kap sayısı yoksa) */
export function itemRemaining(s, it) {
  const a = allocation({ ...s, items: [it] })[0];
  if (!a) return {};
  if (a.cartons.total != null) return { cartons: Math.max(0, a.cartons.total - a.cartons.assigned) };
  if (a.qty.total != null) return { qty: Math.max(0, round(a.qty.total - a.qty.assigned, 6)) };
  return {};
}

/** Tüm dolu kalemleri tek palete koyar (mevcut paletlerin yerine) */
export function allOnOnePallet(s) {
  const lines = realItems(s).map((it) => {
    const pk = pos(it.packages);
    return newPalletLine(pk ? { itemId: it.id, cartons: String(Math.round(pk)) } : { itemId: it.id, qty: str(it.qty) });
  });
  s.pallets = [newPallet({ id: uid(), no: "1", lines })];
}

/** Palete, henüz dağıtılmamış her kalemin kalanını ekler (aynı kalemin satırı varsa artırır). Eklenen/artırılan satır sayısı döner. */
export function fillRemaining(s, palletId) {
  const p = (s.pallets || []).find((x) => x.id === palletId);
  if (!p) return 0;
  let count = 0;
  for (const it of realItems(s)) {
    const r = itemRemaining(s, it);
    const key = r.cartons ? "cartons" : r.qty ? "qty" : null;
    if (!key) continue;
    const cur = p.lines.find((l) => l.itemId === it.id);
    if (cur && key === "cartons") { cur.cartons = String((lineCartons(cur) || 0) + r.cartons); cur.qty = ""; } // elle yazılmış miktar eskir: öneri devralır
    else if (cur) cur.qty = toInput((n(cur.qty) || 0) + r.qty);
    else p.lines.push(newPalletLine({ itemId: it.id, [key]: key === "cartons" ? String(r.cartons) : toInput(r.qty) }));
    count++;
  }
  return count;
}

/** Palete bir kalem satırı ekler: kalanı kadar (kalan yoksa boş) */
export function addItemLine(s, palletId, itemId) {
  const p = (s.pallets || []).find((x) => x.id === palletId);
  const it = (s.items || []).find((x) => x.id === itemId);
  if (!p || !it) return;
  const r = itemRemaining(s, it);
  p.lines.push(newPalletLine({ itemId, ...(r.cartons ? { cartons: String(r.cartons) } : r.qty ? { qty: toInput(r.qty) } : {}) }));
}

/** Kalem bazlı Packing List'te "tüm mal tek palette" seçeneği: kapalıysa null; açıksa özet metinleri
    (packages: "ONE (1) PALLET, STC TWELVE (12) CARTONS", dims: "120 x 80 x 150 CM" ya da yazıldığı gibi,
    volume: toplam hacim yoksa ölçüden hesaplanan m³). T = computeTotals(s) */
export function singlePalletInfo(s, T) {
  if (!s.packing?.onePallet) return null;
  // Kaplar zaten palet olarak sayılmışsa "STC ONE (1) PALLETS" çelişkisi yazılmaz
  const allPallets = packageTypeLabel(s, T).split(" / ").every((t) => /^PALLET/i.test(t.trim()));
  const inner = allPallets ? "" : packagesText(s, T, { words: true });
  const raw = str(s.packing.palletDims).trim();
  const m = raw.match(/^(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(?:cm)?$/i);
  return {
    packages: `${packagesInWords(1, "PALLET")}${inner ? `, STC ${inner}` : ""}`,
    dims: m ? `${m[1]} x ${m[2]} x ${m[3]} CM` : raw,
    volume: T.volume || !m ? null : palletVolume({ dimensions: `${m[1]}x${m[2]}x${m[3]}` }) // hacim yalnız cm olarak okunan ölçüden
  };
}
