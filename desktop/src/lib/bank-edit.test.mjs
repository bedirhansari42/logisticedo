import test from "node:test";
import assert from "node:assert/strict";
import { sameBank, touchesSaved } from "./bank-edit.mjs";

const b = (id, extra = {}) => ({ id, currency: "USD", bankName: "X", branch: "", accountName: "A", iban: "TR1", swift: "S", accountNo: "1", isDefault: false, ...extra });

test("sameBank ignores key order and compares every field", () => {
  assert.equal(sameBank(b("1"), { ...b("1") }), true);
  assert.equal(sameBank({ id: "1", currency: "USD" }, { currency: "USD", id: "1" }), true);
  assert.equal(sameBank(b("1"), b("1", { iban: "TR2" })), false);
  assert.equal(sameBank(b("1"), b("1", { isDefault: true })), false);
});

test("touchesSaved is false when nothing saved was changed, even if a new card was added", () => {
  const saved = [b("1"), b("2")];
  assert.equal(touchesSaved(saved, [b("1"), b("2")]), false);
  assert.equal(touchesSaved(saved, [b("1"), b("2"), b("3", { bankName: "new" })]), false);
  assert.equal(touchesSaved([], [b("3")]), false);
});

test("touchesSaved is true when a saved card was edited or disappeared", () => {
  const saved = [b("1"), b("2")];
  assert.equal(touchesSaved(saved, [b("1", { bankName: "Y" }), b("2")]), true);
  assert.equal(touchesSaved(saved, [b("1")]), true);
  assert.equal(touchesSaved(saved, [b("1", { isDefault: true }), b("2")]), true);
});

test("touchesSaved tolerates missing lists", () => {
  assert.equal(touchesSaved(undefined, undefined), false);
  assert.equal(touchesSaved(undefined, [b("1")]), false);
  assert.equal(touchesSaved([b("1")], undefined), true);
});
