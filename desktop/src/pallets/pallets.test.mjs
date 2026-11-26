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
  assert.deepEqual(["l1", "l2", "l3", "l4", "l5"].map((k) => m.get(k)), ["1-5", "6-8", "9-10", "11-13", "14"]);
});

test("suggested qty from cartons; an entered qty wins", () => {
  const s = st([item({ id: "a", qty: "50", packages: "5" }), item({ id: "b", qty: "10", packages: "3" })]);
  assert.deepEqual(P.lineQty(s, line("a", 2)), { value: 20, suggested: true });
  assert.deepEqual(P.lineQty(s, line("a", 2, 7)), { value: 7, suggested: false });
  assert.deepEqual(P.lineQty(s, line("b", 1)), { value: 3.333, suggested: true });
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
