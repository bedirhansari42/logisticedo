# Elle C/No. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Packing List by Pallet'te C/No. satır satır elle girilebilsin; boşsa otomatik numara önerilsin.

**Architecture:** Palet satırına `cno` metni; `cartonNumbers` elle değeri ve öneriyi `{ value, suggested }` olarak döner, elle değer sayıyla bitiyorsa sayaç oradan sürer. PDF ve masaüstü tablosu bunu kullanır.

**Tech Stack:** ES modülleri (assets/js/app), React (desktop), node:test.

**Spec:** `docs/superpowers/specs/2026-11-27-manual-carton-numbers-design.md`

## Global Constraints
- Eski kayıt/yedek: `cno` yoksa "" (otomatik davranış aynen).
- Komutlar `desktop/` içinden; commit yok (kullanıcı git'i elle yönetir).

## Review Focus
- Elle "101-105" sonrası boş satır 106'dan başlar (Task 1 testi).
- Elle "SEE MARKS" sonrası sayım koli sayısından sürer (Task 1 testi).
- Kap sayısı olmayan satıra elle C/No. → PDF'te sütun görünür (Task 2 doğrulaması).
- Sahipsiz satırın elle C/No.'su sayacı etkilemez (Task 1 testi).
- `normalizePallets` bozuk `cno`'yu (sayı, null) metne çevirir (Task 1 testi).

---

### Task 1: Motor

**Files:** `assets/js/app/doc-model.js` (`newPalletLine`), `assets/js/app/pallets.js` (`normalizePallets`, `cartonNumbers`), test `desktop/src/pallets/pallets.test.mjs`.

**Interfaces — Produces:** `line.cno: string`; `cartonNumbers(s) -> Map<lineId, { value: string, suggested: boolean }>`.

- [ ] **Step 1: Failing tests** — mevcut "carton numbers run across pallets" ve "orphan lines" testleri yeni biçime (`m.get(k).value`, `suggested: true`) güncellenir; yeni testler:

```js
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
```
- [ ] **Step 2:** `npm run test:pallets` → yeni/güncellenen testler FAIL.
- [ ] **Step 3:** `newPalletLine` varsayılanına `cno: ""`; `normalizePallets` `cno: str(l.cno)`; `cartonNumbers`: sayaç `k`; satır için elle değer (`str(l.cno).trim()`) varsa `{value, suggested:false}` ve sondaki sayı (`/(\d+)\s*$/`) varsa `k = o sayı`, yoksa `k += koli`; elle değer yoksa ve koli varsa bugünkü aralık `{suggested:true}`.
- [ ] **Step 4:** `npm run test:pallets` ve `npm run test:backup` → PASS.

### Task 2: PDF ve masaüstü tablosu

**Files:** `assets/js/app/pdf-builder.js` (`renderPalletList`), `desktop/src/components/form/PalletsTable.jsx`.

**Interfaces — Consumes:** `cartonNumbers` (Task 1).

- [ ] **Step 1:** PDF: `cno.get(l.id)?.value || ""`; C/No. sütunu `ctnTotal || allLines.some((l) => cno.get(l.id) && !cno.get(l.id).suggested)` ise; koli sütunu yalnız `ctnTotal` ise (sütunları ayır).
- [ ] **Step 2:** Tablo: C/No. hücresi `<input>` (`value={l.cno}`, `placeholder` = öneri, `maxLength={40}`, aria-label `d.pal.cno` + açıklama); düzenleme ham metni yazar (`editLine` cno için temizleyicisiz).
- [ ] **Step 3:** `node scripts/check-i18n.mjs`, `npx vite build` başarılı; başsız Chrome: PDF'te elle "101-105" + sonraki "106-108"; masaüstünde C/No. yazılabilir, boşken öneri gri. Tüm `npm run test:*` PASS.
