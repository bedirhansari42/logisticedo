import test from "node:test";
import assert from "node:assert/strict";
import { nextProformaNo } from "./model.mjs";

test("son sayı bir artar, sıfır dolgusu korunur", () => {
  assert.equal(nextProformaNo(["PI-2026-009"]), "PI-2026-010");
});
test("boş numaralar atlanır, ilk sayılı numara kullanılır", () => {
  assert.equal(nextProformaNo(["", "PF7"]), "PF8");
});
test("sayısı olmayan numaradan öneri çıkmaz", () => {
  assert.equal(nextProformaNo(["ABC"]), "");
});
test("liste boşsa öneri yok", () => {
  assert.equal(nextProformaNo([]), "");
});
test("basamak sayısı büyüyebilir", () => {
  assert.equal(nextProformaNo(["PI-99"]), "PI-100");
});
