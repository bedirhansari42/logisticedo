import test from "node:test";
import assert from "node:assert/strict";
import { proformaToShipmentState } from "./convert.mjs";

const suggest = (p) => "CI-" + p.replace(/^PI-/, "");
const EMPTY = { notes: "" };
const base = (meta = {}) => ({
  meta: { invoiceNo: "X", invoiceDate: "2020-01-01", plNo: "PL-1", proformaNo: "PI-7", proformaDate: "2026-11-01", currency: "USD", ...meta },
  items: [{ id: "a", description: "Motor" }],
  buyer: { name: "Alıcı" },
  proforma: { notes: "not" }
});
const run = (s, o = {}) => proformaToShipmentState(s, { today: "2026-11-14", suggestInvoiceNo: suggest, emptyProforma: EMPTY, ...o });

test("fatura no proforma numarasından önerilir", () => {
  assert.equal(run(base()).meta.invoiceNo, "CI-7");
});
test("proforma numarası boşsa fatura no boş kalır ve öneri çağrılmaz", () => {
  let called = false;
  const out = run(base({ proformaNo: "" }), { suggestInvoiceNo: () => { called = true; return "CI-"; } });
  assert.equal(out.meta.invoiceNo, "");
  assert.equal(called, false);
});
test("packing list no boşalır, fatura tarihi bugün olur", () => {
  const out = run(base());
  assert.equal(out.meta.plNo, "");
  assert.equal(out.meta.invoiceDate, "2026-11-14");
});
test("proforma no ve tarihi korunur", () => {
  const out = run(base());
  assert.equal(out.meta.proformaNo, "PI-7");
  assert.equal(out.meta.proformaDate, "2026-11-01");
});
test("sonuç girdiden bağımsız bir kopyadır", () => {
  const input = base();
  const out = run(input);
  out.items[0].description = "değişti";
  out.buyer.name = "başka";
  assert.equal(input.items[0].description, "Motor");
  assert.equal(input.buyer.name, "Alıcı");
});
test("proforma notları sıfırlanır", () => {
  assert.deepEqual(run(base()).proforma, EMPTY);
});
