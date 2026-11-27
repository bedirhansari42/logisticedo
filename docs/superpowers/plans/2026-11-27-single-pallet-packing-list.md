# Packing List "Tüm mal tek palette" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paketleme adımına "Tüm mal tek palette" kutusu + palet ölçüsü; işaretliyse kalem bazlı Packing List PDF'i tek paleti ve ölçüsünü yazar.

**Architecture:** İki yeni `state.packing` alanı. Metni saf bir motor fonksiyonu (`singlePalletInfo`, pallets.js) üretir; `renderPacking` yalnız onu çağırır. Form alanları `documents.html`'e eklenir, masaüstü formu `npm run schema` ile şemadan çizilir.

**Tech Stack:** Saf ES modülleri (assets/js/app), pdf-lib, React + Vite (desktop), node:test.

**Spec:** `docs/superpowers/specs/2026-11-27-single-pallet-packing-list-design.md`

## Global Constraints

- Yalnız kalem bazlı Packing List (`renderPacking`) değişir; öteki belgeler ve "Packing List by Pallet" değişmez.
- Palet ağırlığı alanı yok; Paletler sayfasıyla veri paylaşımı yok.
- Belge metinleri İngilizce, arayüz TR + EN.
- Komutlar `desktop/` içinden: `npm run test:pallets`, `npm run schema`, `node scripts/check-i18n.mjs`, `npx vite build`.
- Kullanıcı git'i elle yönetir: commit adımı yok.

## Review Focus

- Kutu işaretli, ölçü boş → "Pallet Dimensions" satırı yok, paket satırı yine `ONE (1) PALLET…` (Task 1 testi).
- Kutu işaretli, kalemlerde kap yok → yalnız `ONE (1) PALLET` (Task 1 testi).
- Ölçü serbest metin ("approx. 1.2 m") → olduğu gibi basılır, hacim önerilmez (Task 1 testi).
- Elle girilen toplam hacim varsa palet hacmi onu ezmez (Task 1 testi).
- Eski kayıt/yedek (alanlar yok) → kutu kapalı, PDF değişmez (Task 1: `migrate` testi).

---

### Task 1: Motor — durum alanları ve `singlePalletInfo`

**Files:**
- Modify: `assets/js/app/doc-model.js` (`createEmptyState` → `packing`)
- Modify: `assets/js/app/pallets.js`
- Test: `desktop/src/pallets/pallets.test.mjs`

**Interfaces:**
- Produces: `packing.onePallet: boolean` (false), `packing.palletDims: string` ("").
- Produces: `singlePalletInfo(s, T) -> null | { packages: string, dims: string, volume: number | null }` — `T` = `computeTotals(s)`; kutu kapalıysa `null`.

- [ ] **Step 1: Failing tests** (`computeTotals`, `createEmptyState` doc-model'den; `migrate` desktop/src/lib/shipment-state.js'ten)

```js
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
test("old saved state gets the option off", () => {
  const s = migrate({ packing: { packageType: "BOXES" } });
  assert.deepEqual([s.packing.onePallet, s.packing.palletDims, s.packing.packageType], [false, "", "BOXES"]);
});
```

- [ ] **Step 2:** `cd desktop && npm run test:pallets` → yeni testler FAIL (`singlePalletInfo is not a function`, alanlar undefined).
- [ ] **Step 3:** `createEmptyState` packing'e `onePallet: false, palletDims: ""`; pallets.js'e `singlePalletInfo`. `packages`: `packagesInWords(1, "PALLET")` + (varsa) `, STC ${packagesText(s, T, { words: true })}`. `dims`: `palletVolume`'daki regex eşleşirse üç sayı `" x "` ile + `" CM"`, değilse kırpılmış metin. `volume`: `T.volume` boşsa `palletVolume({ dimensions })`, değilse `null`.
- [ ] **Step 4:** `npm run test:pallets` → hepsi PASS; `npm run test:backup` PASS.

### Task 2: PDF — `renderPacking`

**Files:** Modify `assets/js/app/pdf-builder.js` (`renderPacking`, özet bloğu)

**Interfaces:** Consumes `singlePalletInfo(s, T)` (Task 1).

- [ ] **Step 1:** `info = singlePalletInfo(s, T)`; varsa özetteki "Total Packages" değeri `info.packages`, ardından `info.dims` doluysa `["Pallet Dimensions", info.dims]`; "Volume" satırı `T.volume` yoksa `info.volume`'dan (`${fmtVolume(v)} M³`). Etiket sütunu genişliği en uzun etikete göre (renderPalletList'teki `keyW` gibi), çünkü "Pallet Dimensions" 70 pt'ye sığmayabilir. Tablo değişmez.
- [ ] **Step 2:** `node --input-type=module --check < assets/js/app/pdf-builder.js`.
- [ ] **Step 3:** Başsız Chrome ile `buildPdf(state, null, "pl")` üret (kutu açık + ölçülü, kutu kapalı); `qlmanage` görüntüsünde özet: `ONE (1) PALLET, STC …`, `Pallet Dimensions 120 x 80 x 150 CM`, `Volume 1.440 M³`; kutu kapalıyken eskisiyle aynı.

### Task 3: Form ve metinler

**Files:** Modify `documents.html` (F Paketleme), `assets/js/i18n.js` (TR+EN), `desktop/src/lib/form-schema.json` (üretilir).

- [ ] **Step 1:** F bölümüne, kap cinsi/marka ızgarasından sonra iki sütunlu ızgara: `<label class="check"><input type="checkbox" data-bind="packing.onePallet"><span data-i18n="f.onePallet">Tüm mal tek palette</span></label>` ve `data-bind="packing.palletDims"` alanı (etiket `f.palletDims`, placeholder `120x80x150`).
- [ ] **Step 2:** i18n: `f.onePallet` "Tüm mal tek palette" / "All goods on one pallet"; `f.palletDims` "Palet ölçüsü (cm)" / "Pallet dimensions (cm)".
- [ ] **Step 3:** `cd desktop && npm run schema && node scripts/check-i18n.mjs && npx vite build` → şema yeni iki alanı içerir, 0 eksik, derleme başarılı.
- [ ] **Step 4:** Masaüstü arayüzde (file:// `desktop/app/index.html`, CDP) Paketleme adımında kutu ve alanın göründüğünü, işaretleyip ölçü yazınca önizlemedeki Packing List özetinin değiştiğini doğrula. Tüm `npm run test:*` PASS.
