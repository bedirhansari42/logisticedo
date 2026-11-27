import test from "node:test";
import assert from "node:assert/strict";

// Motor (assets/js/app) tarayıcı için yazıldı: dil ve depolama için küçük taklitler
globalThis.localStorage = { getItem: (k) => (k === "lgx.lang" ? "en" : null), setItem() {} };
globalThis.document = { querySelectorAll: () => [], documentElement: { dataset: {} }, title: "" };
const { newPallet, newPalletLine } = await import("../../../assets/js/app/doc-model.js");
const P = await import("../../../assets/js/app/pallets.js");

const item = (o) => ({ id: o.id, description: "x", qty: "", unit: "PCS", packages: "", packageType: "", netWeight: "", grossWeight: "", hsCode: "", ...o });
const line = (itemId, cartons = "", qty = "", id) => newPalletLine({ itemId, cartons: String(cartons), qty: String(qty), ...(id ? { id } : {}) });
const pal = (lines, o = {}) => newPallet({ lines, ...o });
const st = (items, pallets = [], packing = {}) => ({ items, pallets, packing: { packageType: "", ...packing } });

test("newPallet has empty lines; newPalletLine has an id", () => {
  assert.deepEqual(newPallet().lines, []);
  const l = newPalletLine({ itemId: "a" });
  assert.equal(typeof l.id, "string");
  assert.deepEqual([l.itemId, l.cartons, l.qty], ["a", "", ""]);
});

test("normalizePallets keeps legacy contents and drops junk lines", () => {
  const out = P.normalizePallets([{ no: 1, contents: "Pumps 10 PCS" }, "x", { lines: [{ itemId: "a", cartons: 5 }, { cartons: "2" }, null] }]);
  assert.equal(out.length, 2);
  assert.equal(out[0].no, "1");
  assert.equal(out[0].contents, "Pumps 10 PCS");
  assert.deepEqual(out[0].lines, []);
  assert.equal(out[1].lines.length, 1);
  assert.equal(out[1].lines[0].cartons, "5");
  for (const p of out) { assert.equal(typeof p.id, "string"); for (const l of p.lines) assert.equal(typeof l.id, "string"); }
});

test("normalizePallets of a non-array is empty", () => {
  for (const v of [null, "x", {}, undefined]) assert.deepEqual(P.normalizePallets(v), []);
});

test("carton numbers run across pallets", () => {
  const items = [item({ id: "a", packages: "5" }), item({ id: "b", packages: "5" }), item({ id: "c", packages: "3" }), item({ id: "d", packages: "1" })];
  const s = st(items, [pal([line("a", 5, "", "l1"), line("b", 3, "", "l2")]), pal([line("b", 2, "", "l3"), line("c", 3, "", "l4"), line("d", 1, "", "l5")])]);
  const m = P.cartonNumbers(s);
  assert.deepEqual(["l1", "l2", "l3", "l4", "l5"].map((k) => m.get(k)), ["1-5", "6-8", "9-10", "11-13", "14"].map((value) => ({ value, suggested: true })));
});

test("suggested qty from cartons; an entered qty wins", () => {
  const s = st([item({ id: "a", qty: "50", packages: "5" }), item({ id: "b", qty: "10", packages: "3" })]);
  assert.deepEqual(P.lineQty(s, line("a", 2)), { value: 20, suggested: true });
  assert.deepEqual(P.lineQty(s, line("a", 2, 7)), { value: 7, suggested: false });
  assert.deepEqual(P.lineQty(s, line("b", 1)), { value: 3, suggested: true });
});

test("suggested pallet weights from item shares; an entered weight wins", () => {
  const items = [item({ id: "a", qty: "50", packages: "5", netWeight: "100", grossWeight: "110" })];
  const p = pal([line("a", 2)]);
  const s = st(items, [p]);
  assert.deepEqual(P.palletWeight(s, p, "net"), { value: 40, suggested: true });
  assert.deepEqual(P.palletWeight(s, p, "gross"), { value: 44, suggested: true });
  p.gross = "335";
  assert.deepEqual(P.palletWeight(s, p, "gross"), { value: 335, suggested: false });
  assert.equal(P.palletWeight(s, pal([]), "net").value, null);
});

test("allocation: ok / under / over", () => {
  const items = [item({ id: "a", qty: "50", packages: "5" })];
  const status = (n) => P.allocation(st(items, [pal([line("a", n)])]))[0];
  assert.equal(status(5).status, "ok");
  const u = status(3);
  assert.equal(u.status, "under");
  assert.deepEqual(u.cartons, { total: 5, assigned: 3 });
  assert.equal(status(6).status, "over");
});

test("allocation reacts to item changes", () => {
  const it = item({ id: "a", qty: "100", packages: "10" });
  const s = st([it], [pal([line("a", 8)])]);
  assert.equal(P.allocation(s)[0].status, "under");
  it.packages = "5";
  assert.equal(P.allocation(s)[0].status, "over");
});

test("item without packages: no carton numbers, allocation by quantity", () => {
  const items = [item({ id: "a", qty: "10" })];
  const full = st(items, [pal([line("a", "", 10, "l1")])]);
  assert.equal(P.allocation(full)[0].status, "ok");
  assert.equal(P.cartonNumbers(full).has("l1"), false);
  assert.equal(P.allocation(st(items, [pal([line("a", "", 4)])]))[0].status, "under");
});

test("empty item rows are not allocated", () => {
  const s = st([item({ id: "a", description: "", qty: "" }), item({ id: "b", qty: "1" })]);
  assert.deepEqual(P.allocation(s).map((r) => r.itemId), ["b"]);
});

test("orphan lines: reported, skipped in numbering, pallet status partial", () => {
  const items = [item({ id: "a", qty: "5", packages: "5" })];
  const s = st(items, [pal([line("a", 5, "", "ok"), line("gone", 2, "", "orph")])]);
  assert.deepEqual(P.orphanLines(s), ["orph"]);
  assert.equal(P.cartonNumbers(s).has("orph"), false);
  assert.equal(P.palletStatus(s), "partial");
});

test("non-numeric input is treated as empty and never yields NaN", () => {
  const items = [item({ id: "a", qty: "10", packages: "2", netWeight: "20", grossWeight: "22" })];
  const p = pal([line("a", "abc", "x", "l1")], { net: "?" });
  const s = st(items, [p]);
  assert.equal(P.lineQty(s, p.lines[0]).value, null);
  assert.equal(P.palletWeight(s, p, "net").value, null);
  assert.equal(P.cartonNumbers(s).has("l1"), false);
  assert.equal(/NaN/.test(JSON.stringify([P.allocation(s), P.palletWeight(s, p, "gross"), [...P.cartonNumbers(s)]])), false);
});

test("packageWord: one shared package type, otherwise PACKAGES", () => {
  const w = (types, def = "") => P.packageWord(st(types.map((t, i) => item({ id: String(i), packageType: t })), [], { packageType: def }));
  assert.equal(w(["CARTONS", "carton"]), "CARTONS");
  assert.equal(w(["CARTON"]), "CARTONS");
  assert.equal(w(["CARTONS", "BOXES"]), "PACKAGES");
  assert.equal(w(["", ""]), "PACKAGES");
  assert.equal(w(["", ""], "BOXES"), "BOXES");
});

test("allOnOnePallet: one pallet with every filled item", () => {
  const items = [item({ id: "a", qty: "50", packages: "5" }), item({ id: "b", qty: "3" }), item({ id: "e", description: "", qty: "" })];
  const s = st(items, [pal([]), pal([])]);
  P.allOnOnePallet(s);
  assert.equal(s.pallets.length, 1);
  assert.deepEqual(s.pallets[0].lines.map((l) => [l.itemId, l.cartons, l.qty]), [["a", "5", ""], ["b", "", "3"]]);
  assert.equal(P.palletStatus(s), "ready");
});

test("fillRemaining adds what is left, merges with an existing line of the same item", () => {
  const items = [item({ id: "a", qty: "50", packages: "5" })];
  const p1 = pal([line("a", 3)]), p2 = pal([]);
  const s = st(items, [p1, p2]);
  assert.equal(P.fillRemaining(s, p2.id), 1);
  assert.deepEqual(p2.lines.map((l) => [l.itemId, l.cartons]), [["a", "2"]]);
  assert.equal(P.fillRemaining(s, p2.id), 0);
  p1.lines[0].cartons = "1"; // 2 karton yeniden boşa çıktı
  assert.equal(P.fillRemaining(s, p2.id), 1);
  assert.deepEqual(p2.lines.map((l) => [l.itemId, l.cartons]), [["a", "4"]]);
});

test("addItemLine adds the remaining cartons, or an empty line when nothing is left", () => {
  const items = [item({ id: "a", qty: "50", packages: "5" })];
  const p1 = pal([line("a", 3)]), p2 = pal([]);
  const s = st(items, [p1, p2]);
  P.addItemLine(s, p2.id, "a");
  assert.equal(p2.lines.at(-1).cartons, "2");
  P.addItemLine(s, p2.id, "a");
  assert.equal(p2.lines.at(-1).cartons, "");
});

test("palletStatus: empty, ready, partial", () => {
  const items = [item({ id: "a", qty: "5", packages: "5" })];
  assert.equal(P.palletStatus(st(items, [])), "empty");
  assert.equal(P.palletStatus(st(items, [pal([line("a", 5)])])), "ready");
  assert.equal(P.palletStatus(st(items, [pal([line("a", 2)])])), "partial");
});

// ---- Son inceleme düzeltmeleri ----
const { relocalize } = await import("../../../assets/js/app/doc-model.js");

test("relocalize converts pallet line cartons and qty with the rest of the form", () => {
  const s = { items: [], charges: {}, packing: {}, pallets: [pal([line("a", "3", "12,345")], { net: "1,5" })] };
  relocalize(s, "tr", "en");
  assert.deepEqual([s.pallets[0].lines[0].qty, s.pallets[0].lines[0].cartons, s.pallets[0].net], ["12.345", "3", "1.5"]);
  relocalize(s, "en", "tr");
  assert.equal(s.pallets[0].lines[0].qty, "12,345");
});

test("a typed qty that disagrees with the item is reported even when cartons match", () => {
  const items = [item({ id: "a", qty: "60", packages: "5" })];
  const a = P.allocation(st(items, [pal([line("a", 5, 50)])]))[0];
  assert.equal(a.status, "under");
  assert.equal(a.basis, "qty");
  assert.equal(P.allocation(st(items, [pal([line("a", 5, 70)])]))[0].status, "over");
  const ok = P.allocation(st(items, [pal([line("a", 5)])]))[0];
  assert.deepEqual([ok.status, ok.basis], ["ok", "cartons"]);
  assert.equal(P.palletStatus(st(items, [pal([line("a", 5, 50)])])), "partial");
});

test("fillRemaining clears a typed qty when it raises cartons, so the suggestion takes over", () => {
  const items = [item({ id: "a", qty: "50", packages: "5" })];
  const p = pal([line("a", 3, 30)]);
  const s = st(items, [p]);
  P.fillRemaining(s, p.id);
  assert.deepEqual([p.lines[0].cartons, p.lines[0].qty], ["5", ""]);
  assert.equal(P.allocation(s)[0].status, "ok");
});

// ---- Ertelenen küçükler (2026-11-27) ----

test("suggested quantities add up to the item total despite rounding", () => {
  const items = [item({ id: "a", qty: "10", packages: "3" })];
  const s = st(items, [pal([line("a", 1, "", "l1")]), pal([line("a", 1, "", "l2")]), pal([line("a", 1, "", "l3")])]);
  const qs = s.pallets.map((p) => P.lineQty(s, p.lines[0]).value);
  assert.deepEqual(qs, [3, 4, 3]);
  assert.equal(P.allocation(s)[0].status, "ok");
  assert.equal(P.palletStatus(s), "ready");
});

test("suggested pallet weights add up to the item weight despite rounding", () => {
  const items = [item({ id: "a", qty: "3", packages: "3", netWeight: "10", grossWeight: "10" })];
  const s = st(items, [pal([line("a", 1)]), pal([line("a", 1)]), pal([line("a", 1)])]);
  const ws = s.pallets.map((p) => P.palletWeight(s, p, "net").value);
  assert.deepEqual(ws, [3.33, 3.34, 3.33]);
});

test("description-only heading rows are not reported as missing from pallets", () => {
  const items = [item({ id: "h", description: "SECTION A" }), item({ id: "a", qty: "5", packages: "5" })];
  const s = st(items, [pal([line("a", 5)])]);
  assert.deepEqual(P.allocation(s).map((r) => r.itemId), ["a"]);
  assert.equal(P.palletStatus(s), "ready");
});

test("fractional cartons are invalid, not silently rounded", () => {
  assert.equal(P.lineCartons({ cartons: "2.5" }), null);
  assert.equal(P.lineCartons({ cartons: "3" }), 3);
  const items = [item({ id: "a", qty: "50", packages: "5" })];
  assert.equal(P.allocation(st(items, [pal([line("a", "4.6")])]))[0].status, "under");
});

test("input cleaners: cartons are whole numbers, amounts never negative", () => {
  assert.equal(P.cleanCartons("2.5"), "25");
  assert.equal(P.cleanCartons("-3a"), "3");
  assert.equal(P.cleanAmount("-12,5kg"), "12,5");
  assert.equal(P.cleanAmount("1.250"), "1.250");
});

test("negative typed values are ignored and the suggestion takes over", () => {
  const items = [item({ id: "a", qty: "50", packages: "5", netWeight: "100" })];
  const p = pal([line("a", 2, "-5")], { net: "-3" });
  const s = st(items, [p]);
  assert.deepEqual(P.lineQty(s, p.lines[0]), { value: 20, suggested: true });
  assert.deepEqual(P.palletWeight(s, p, "net"), { value: 40, suggested: true });
});

test("a line whose item row was emptied is an orphan and is not printed", () => {
  const items = [item({ id: "a", description: "", qty: "" }), item({ id: "b", qty: "2", packages: "2" })];
  const p = pal([line("a", 1, "", "la"), line("b", 2, "", "lb")]);
  const s = st(items, [p]);
  assert.deepEqual(P.orphanLines(s), ["la"]);
  assert.deepEqual(P.linkedLines(s, p).map((l) => l.id), ["lb"]);
  assert.equal(P.cartonNumbers(s).has("la"), false);
  assert.deepEqual(P.cartonNumbers(s).get("lb"), { value: "1-2", suggested: true });
});

test("palletIsBlank: only an untouched pallet can be removed without asking", () => {
  assert.equal(P.palletIsBlank(newPallet({ no: "3" })), true);
  assert.equal(P.palletIsBlank(newPallet({ gross: "120" })), false);
  assert.equal(P.palletIsBlank(newPallet({ dimensions: "120x80x150" })), false);
  assert.equal(P.palletIsBlank(newPallet({ contents: "fragile" })), false);
  assert.equal(P.palletIsBlank(newPallet({ lines: [line("a", 1)] })), false);
});

test("itemRemaining tells what is left of an item", () => {
  const items = [item({ id: "a", qty: "50", packages: "5" }), item({ id: "b", qty: "7" })];
  const s = st(items, [pal([line("a", 3), line("b", "", 2)])]);
  assert.deepEqual(P.itemRemaining(s, items[0]), { cartons: 2 });
  assert.deepEqual(P.itemRemaining(s, items[1]), { qty: 5 });
});

test("palletTypeWord prints one pallet's type in the singular", () => {
  const w = P.palletTypeWord;
  assert.deepEqual(["PALLETS", "cartons", "BOXES", "CRATES", "CASES", "PIECES", "BUNDLES", "PALLET", "GLASS", " skids ", ""].map(w),
    ["PALLET", "CARTON", "BOX", "CRATE", "CASE", "PIECE", "BUNDLE", "PALLET", "GLASS", "SKID", ""]);
});

test("a whole-number item quantity gets whole-number suggestions; a fractional one keeps 3 decimals", () => {
  const three = (qty) => {
    const s = st([item({ id: "a", qty, packages: "3" })], [1, 2, 3].map(() => pal([line("a", 1)])));
    return s.pallets.map((p) => P.lineQty(s, p.lines[0]).value);
  };
  assert.deepEqual(three("10"), [3, 4, 3]);
  assert.deepEqual(three("1000"), [333, 334, 333]);
  assert.deepEqual(three("10.1"), [3.367, 3.366, 3.367]);
  assert.deepEqual(three("2"), [1, 0, 1]);
});

// ---- Packing List: tüm mal tek palette (2026-11-27) ----
const M = await import("../../../assets/js/app/doc-model.js");

test("singlePalletInfo is null unless the option is on", () => {
  const s = M.createEmptyState();
  assert.deepEqual([s.packing.onePallet, s.packing.palletDims], [false, ""]);
  assert.equal(P.singlePalletInfo(s, M.computeTotals(s)), null);
});

test("one pallet: packages in words with STC, dims formatted, volume from dims", () => {
  const s = M.createEmptyState();
  s.items = [M.newItem({ description: "Pump", qty: "10", packages: "12", packageType: "CARTONS" })];
  Object.assign(s.packing, { onePallet: true, palletDims: "120x80x150" });
  assert.deepEqual(P.singlePalletInfo(s, M.computeTotals(s)), { packages: "ONE (1) PALLET, STC TWELVE (12) CARTONS", dims: "120 x 80 x 150 CM", volume: 1.44 });
});

test("one pallet without packages or dims", () => {
  const s = M.createEmptyState();
  s.items = [M.newItem({ description: "Pump", qty: "10" })];
  s.packing.onePallet = true;
  assert.deepEqual(P.singlePalletInfo(s, M.computeTotals(s)), { packages: "ONE (1) PALLET", dims: "", volume: null });
});

test("free-text dims are kept; a typed total volume wins", () => {
  const s = M.createEmptyState();
  Object.assign(s.packing, { onePallet: true, palletDims: "approx. 1.2 m", totalVolume: "2" });
  const r = P.singlePalletInfo(s, M.computeTotals(s));
  assert.equal(r.dims, "approx. 1.2 m");
  assert.equal(r.volume, null);
  s.packing.palletDims = "120x80x150";
  assert.equal(P.singlePalletInfo(s, M.computeTotals(s)).volume, null);
});

test("final review #1: dims that are not plain cm numbers give no volume", () => {
  const s = M.createEmptyState();
  Object.assign(s.packing, { onePallet: true, palletDims: "1200x800x1500 mm" });
  assert.deepEqual(P.singlePalletInfo(s, M.computeTotals(s)), { packages: "ONE (1) PALLET", dims: "1200x800x1500 mm", volume: null });
  s.packing.palletDims = "120x80x150 cm";
  assert.equal(P.singlePalletInfo(s, M.computeTotals(s)).volume, 1.44);
});

test("final review #4: goods already counted as pallets are not repeated after STC", () => {
  const s = M.createEmptyState();
  s.items = [M.newItem({ description: "Pump", qty: "10", packages: "1", packageType: "PALLETS" })];
  s.packing.onePallet = true;
  assert.equal(P.singlePalletInfo(s, M.computeTotals(s)).packages, "ONE (1) PALLET");
  s.items[0].packageType = "PALLET";
  assert.equal(P.singlePalletInfo(s, M.computeTotals(s)).packages, "ONE (1) PALLET");
});

// ---- Elle C/No. (2026-11-27) ----

test("a typed C/No. is kept and later empty lines continue from its last number", () => {
  const items = [item({ id: "a", packages: "10" })];
  const s = st(items, [pal([line("a", 5, "", "l1"), line("a", 3, "", "l2")]), pal([line("a", 2, "", "l3")])]);
  s.pallets[0].lines[0].cno = "101-105";
  const m = P.cartonNumbers(s);
  assert.deepEqual(["l1", "l2", "l3"].map((k) => m.get(k)), [{ value: "101-105", suggested: false }, { value: "106-108", suggested: true }, { value: "109-110", suggested: true }]);
});

test("a typed C/No. without a trailing number does not move the counter", () => {
  const items = [item({ id: "a", packages: "5" })];
  const s = st(items, [pal([line("a", 2, "", "l1"), line("a", 3, "", "l2")])]);
  s.pallets[0].lines[0].cno = "SEE MARKS";
  assert.deepEqual(P.cartonNumbers(s).get("l2"), { value: "3-5", suggested: true });
});

test("a typed C/No. on a line without cartons is kept", () => {
  const s = st([item({ id: "a", qty: "3" })], [pal([line("a", "", 3, "l1")])]);
  s.pallets[0].lines[0].cno = "7";
  assert.deepEqual(P.cartonNumbers(s).get("l1"), { value: "7", suggested: false });
});

test("orphan lines with a typed C/No. are ignored", () => {
  const s = st([item({ id: "a", packages: "2" })], [pal([line("gone", 1, "", "o"), line("a", 2, "", "l1")])]);
  s.pallets[0].lines[0].cno = "500";
  const m = P.cartonNumbers(s);
  assert.equal(m.has("o"), false);
  assert.deepEqual(m.get("l1"), { value: "1-2", suggested: true });
});

test("normalizePallets keeps cno as text", () => {
  const out = P.normalizePallets([{ lines: [{ itemId: "a", cno: 12 }, { itemId: "b", cno: null }, { itemId: "c" }] }]);
  assert.deepEqual(out[0].lines.map((l) => l.cno), ["12", "", ""]);
});
