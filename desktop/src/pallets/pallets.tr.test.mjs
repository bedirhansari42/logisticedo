import test from "node:test";
import assert from "node:assert/strict";

// Türkçe arayüz: ondalık ayırıcı virgül (dil modül yüklenirken bir kez okunur, bu yüzden ayrı dosya)
globalThis.localStorage = { getItem: (k) => (k === "lgx.lang" ? "tr" : null), setItem() {} };
globalThis.document = { querySelectorAll: () => [], documentElement: { dataset: {} }, title: "" };
const { newPallet, newPalletLine } = await import("../../../assets/js/app/doc-model.js");
const P = await import("../../../assets/js/app/pallets.js");

test("decimal comma inputs are read in a Turkish UI", () => {
  const it = { id: "a", description: "x", qty: "10,5", packages: "3", unit: "KG", netWeight: "", grossWeight: "" };
  const p = newPallet({ net: "1,5", lines: [newPalletLine({ itemId: "a", cartons: "2", qty: "" })] });
  const s = { items: [it], pallets: [p], packing: { packageType: "" } };
  assert.deepEqual(P.palletWeight(s, p, "net"), { value: 1.5, suggested: false });
  assert.deepEqual(P.lineQty(s, p.lines[0]), { value: 7, suggested: true });
});
