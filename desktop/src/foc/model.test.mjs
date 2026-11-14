import test from "node:test";
import assert from "node:assert/strict";
import { FOC_REASONS, focReasonText, docGroupsFor } from "./model.mjs";

test("bilinen neden büyük harfle döner", () => {
  assert.equal(focReasonText({ reason: "GIFT", reasonOther: "" }), "GIFT");
});
test("OTHER ise serbest metin kırpılır ve büyük harf olur", () => {
  assert.equal(focReasonText({ reason: "OTHER", reasonOther: "  trade fair " }), "TRADE FAIR");
});
test("OTHER ve boş metin OTHER yazar", () => {
  assert.equal(focReasonText({ reason: "OTHER", reasonOther: "" }), "OTHER");
});
test("boş neden SAMPLE sayılır", () => {
  assert.equal(focReasonText({ reason: "", reasonOther: "" }), "SAMPLE");
});
test("altı neden var", () => {
  assert.equal(FOC_REASONS.length, 6);
});

const groups = [{ key: "commercial", titleKey: "g1", docs: ["ci", "foc", "pl"] }, { key: "shipment", titleKey: "g2", docs: ["si", "bl"] }];
test("ücretsizde ci çıkar, foc kalır", () => {
  const out = docGroupsFor(groups, true);
  assert.deepEqual(out[0].docs, ["foc", "pl"]);
  assert.deepEqual(out[1].docs, ["si", "bl"]);
});
test("ücretsiz değilse foc çıkar, ci kalır", () => {
  assert.deepEqual(docGroupsFor(groups, false)[0].docs, ["ci", "pl"]);
});
test("docGroupsFor girdiyi değiştirmez", () => {
  const before = JSON.stringify(groups);
  docGroupsFor(groups, true);
  assert.equal(JSON.stringify(groups), before);
});
