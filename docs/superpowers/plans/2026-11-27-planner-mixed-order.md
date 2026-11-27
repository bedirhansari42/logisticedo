# Konteyner planı karışık sıra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Planlayıcı birkaç diziliş sırası dener, en çok istif yapanı seçer.
**Architecture:** `planOnce` sıra seçeneği alır; `planLoad` adayları karşılaştırır. Tek dosya: `desktop/src/planner/pack.mjs`.
**Spec:** `docs/superpowers/specs/2026-11-27-planner-mixed-order-design.md`

## Global Constraints
- Sonuç her zaman deterministik; `group` sırası aday → bugünkünden kötü olamaz.
- Yerleşim kuralları (zemin, istif, kapı) değişmez; her aday `validatePlan` geçer.
- Commit yok (kullanıcı git'i elle yönetir).

## Review Focus
- Dolgu (qty boş) kalemi olan yükler: dolgu sayısı adaylar arasında karşılaştırılır (Task 1 testi).
- `cap`/bütçe aşımı olan aday seçilmez (sığmayan sayısına girer).
- Tek kalemli yük: sonuç bugünküyle birebir aynı (Task 1 testi).
- Silindirli yük: aday sayısı ≤ 9 (Task 1: süre/aday testi değil, kod incelemesi).

### Task 1: `pack.mjs`
- [ ] **Step 1: Failing tests** (`pack.test.mjs`, `planOnce` dışa açılır):
  - `"mixed order: never worse than the grouped order (random loads)"`: 25 rastgele yük (2–5 kalem, %15 palet) × 40'; `planLoad` sığmayan ≤ ve konteyner ≤ `planOnce(…, {order:"group"})`; her plan `validatePlan` geçer.
  - `"mixed order: non-stackable pallets no longer take a container on their own"`: 56× 100x62x61 palet (palletized, upright) + 81× 118x67x92 + 38× 67x43x37 (upright) → `planLoad` ilk konteyner dolum % > grouped ilk konteyner dolum % ve konteyner sayısı ≤.
  - `"mixed order: every order gives a valid plan"`: aynı yük `group|volume|height` (mix ölçüm sonrası çıkarıldı) → `validatePlan` ok, yerleşen + sığmayan = toplam adet.
  - `"mixed order: a single item plan is unchanged"`: tek kalem → `planLoad` yerleşimleri `planOnce(group)` ile deepEqual.
  - `"mixed order: deterministic"`: aynı yük iki kez → deepEqual.
- [ ] **Step 2:** `npm run test:planner` → yeni testler FAIL (`planOnce` yok / dolum aynı).
- [ ] **Step 3:** `planOnce` export + `order`; birim dizisi üreten `unitOrder(fixed, order)`; konteyner sürüm sayacıyla `failed`; `planLoad` en iyi silindir adayı + 3 sıra; ölçüte konteyner hacim vektörü.
- [ ] **Step 4:** `npm run test:planner` → hepsi PASS; süre kabul edilebilir (önceki çalışmanın ~4 katından az).
- [ ] **Step 5:** Masaüstü planlayıcıda örnek yükle görsel kontrol (başsız Chrome).
