import test from "node:test";
import assert from "node:assert/strict";
import { defaultBoard, normalizeBoard, addColumn, renameColumn, deleteColumn, addCard, updateCard, deleteCard, moveCard, indexBefore, setColumnColor, moveColumn, COLORS, cardsOf, isOverdue, checkCard, LABELS, LIMITS } from "./board.mjs";

const names = ["Todo", "Doing", "Done"];
const mk = () => defaultBoard(names);
const titles = (b, colId) => cardsOf(b, colId).map((c) => c.title);

test("default board has three named columns and no cards", () => {
  const b = mk();
  assert.deepEqual(b.columns.map((c) => c.name), names);
  assert.deepEqual(b.cards, []);
  assert.deepEqual(LABELS, ["ship", "me"]);
});

test("addCard appends to the end of its column and stamps times", () => {
  let b = mk();
  b = addCard(b, b.columns[0].id, { title: " A ", note: "n", label: "ship", due: "2026-11-20" }, 100);
  b = addCard(b, b.columns[0].id, { title: "B" }, 200);
  assert.deepEqual(titles(b, b.columns[0].id), ["A", "B"]);
  const a = b.cards[0];
  assert.deepEqual([a.note, a.label, a.due, a.createdAt, a.updatedAt], ["n", "ship", "2026-11-20", 100, 100]);
  assert.deepEqual([b.cards[1].label, b.cards[1].due], [null, null]);
});

test("checkCard validates title, label, due and lengths", () => {
  assert.deepEqual(checkCard({ title: "  " }), { ok: false, field: "title", key: "d.nt.err.title" });
  assert.deepEqual(checkCard({ title: "x".repeat(LIMITS.title + 1) }), { ok: false, field: "title", key: "d.nt.err.long" });
  assert.deepEqual(checkCard({ title: "a", note: "x".repeat(LIMITS.note + 1) }), { ok: false, field: "note", key: "d.nt.err.long" });
  assert.equal(checkCard({ title: "a", label: "zzz" }).ok, false);
  assert.equal(checkCard({ title: "a", due: "2026-02-31" }).ok, false);
  assert.equal(checkCard({ title: "a", due: "20.11.2026" }).ok, false);
  assert.equal(checkCard({ title: "a", label: "me", due: "2026-11-20" }).ok, true);
  assert.equal(checkCard({ title: "a" }).ok, true);
});

test("updateCard changes fields and bumps updatedAt; moving column via update appends", () => {
  let b = mk();
  b = addCard(b, b.columns[0].id, { title: "A" }, 1);
  const id = b.cards[0].id;
  b = updateCard(b, id, { title: "A2", label: "me" }, 50);
  assert.deepEqual([b.cards[0].title, b.cards[0].label, b.cards[0].updatedAt], ["A2", "me", 50]);
  b = updateCard(b, id, { columnId: b.columns[2].id }, 60);
  assert.deepEqual(titles(b, b.columns[2].id), ["A2"]);
});

test("moveCard reorders within a column and across columns", () => {
  let b = mk();
  const [c0, c1] = b.columns.map((c) => c.id);
  for (const t of ["A", "B", "C"]) b = addCard(b, c0, { title: t });
  const idOf = (t) => b.cards.find((c) => c.title === t).id;
  b = moveCard(b, idOf("C"), c0, 0);
  assert.deepEqual(titles(b, c0), ["C", "A", "B"]);
  b = moveCard(b, idOf("A"), c1, 0);
  assert.deepEqual([titles(b, c0), titles(b, c1)], [["C", "B"], ["A"]]);
  b = moveCard(b, idOf("B"), c1, 99); // dizin sınırı aşarsa sona
  assert.deepEqual(titles(b, c1), ["A", "B"]);
});

test("column rename, add and delete (cards of a deleted column go too; last column stays)", () => {
  let b = mk();
  b = renameColumn(b, b.columns[1].id, " Bekliyor ");
  assert.equal(b.columns[1].name, "Bekliyor");
  b = addColumn(b, "Yeni");
  assert.equal(b.columns.length, 4);
  b = addCard(b, b.columns[3].id, { title: "X" });
  b = deleteColumn(b, b.columns[3].id);
  assert.deepEqual([b.columns.length, b.cards.length], [3, 0]);
  const only = { ...mk(), columns: [mk().columns[0]] };
  assert.equal(deleteColumn(only, only.columns[0].id).columns.length, 1);
  assert.equal(renameColumn(b, b.columns[0].id, "  ").columns[0].name, names[0]); // boş ad reddedilir
});

test("deleteCard removes just that card", () => {
  let b = mk();
  b = addCard(addCard(b, b.columns[0].id, { title: "A" }), b.columns[0].id, { title: "B" });
  b = deleteCard(b, b.cards[0].id);
  assert.deepEqual(b.cards.map((c) => c.title), ["B"]);
});

test("overdue: past due date and not in the last column", () => {
  let b = mk();
  b = addCard(b, b.columns[0].id, { title: "late", due: "2026-11-10" });
  b = addCard(b, b.columns[2].id, { title: "done late", due: "2026-11-10" });
  b = addCard(b, b.columns[0].id, { title: "today", due: "2026-11-13" });
  b = addCard(b, b.columns[0].id, { title: "none" });
  const now = new Date(2026, 10, 13, 15, 0);
  const od = (t) => isOverdue(b, b.cards.find((c) => c.title === t), now);
  assert.deepEqual(["late", "done late", "today", "none"].map(od), [true, false, false, false]);
});

test("normalizeBoard repairs junk: unknown column, bad fields, no columns", () => {
  assert.deepEqual(normalizeBoard(null, names).columns.map((c) => c.name), names);
  assert.deepEqual(normalizeBoard({ columns: [], cards: [] }, names).columns.length, 3);
  const raw = { columns: [{ id: "c1", name: "A" }, { id: "c1", name: "dup" }, { id: "c2", name: 7 }], cards: [{ id: "k1", columnId: "ghost", title: "T", label: "zzz", due: "bad", order: "x" }, { id: "k2", columnId: "c1" }, "junk"] };
  const b = normalizeBoard(raw, names);
  assert.deepEqual(b.columns.map((c) => c.id), ["c1", "c2"]);
  assert.equal(b.cards.length, 1); // başlıksız ve çöp kartlar atılır
  assert.deepEqual([b.cards[0].columnId, b.cards[0].label, b.cards[0].due], ["c1", null, null]); // bilinmeyen sütun → ilk sütun
});

test("functions never mutate their input", () => {
  let b = mk();
  b = addCard(b, b.columns[0].id, { title: "A" });
  const snap = JSON.stringify(b);
  moveCard(b, b.cards[0].id, b.columns[1].id, 0); updateCard(b, b.cards[0].id, { title: "Z" }); deleteCard(b, b.cards[0].id); addColumn(b, "N"); renameColumn(b, b.columns[0].id, "R"); deleteColumn(b, b.columns[1].id);
  assert.equal(JSON.stringify(b), snap);
});

test("indexBefore maps a drop position to an index in the full column order", () => {
  let b = mk();
  const c0 = b.columns[0].id;
  for (const t of ["A", "B", "C", "D"]) b = addCard(b, c0, { title: t });
  const id = (t) => b.cards.find((c) => c.title === t).id;
  assert.equal(indexBefore(b, c0, id("C"), null), 2);
  assert.equal(indexBefore(b, c0, null, null), 4); // sona
  assert.equal(indexBefore(b, c0, id("D"), id("B")), 2); // taşınan kart sayılmaz: A, C | D
  assert.equal(indexBefore(b, c0, "ghost", null), 4); // bilinmeyen kart → sona
});

test("columns have a user-chosen color from a fixed palette", () => {
  let b = mk();
  assert.ok(b.columns.every((c) => c.color === null));
  assert.ok(COLORS.length >= 6 && COLORS.every((c) => typeof c === "string"));
  b = setColumnColor(b, b.columns[1].id, COLORS[2]);
  assert.deepEqual(b.columns.map((c) => c.color), [null, COLORS[2], null]);
  b = setColumnColor(b, b.columns[1].id, null); // renk kaldırılır
  assert.equal(b.columns[1].color, null);
  assert.equal(setColumnColor(b, b.columns[0].id, "hotpink"), b); // palet dışı reddedilir
  assert.equal(addColumn(b, "Yeni").columns[3].color, null);
});

test("normalizeBoard keeps valid column colors and drops unknown ones", () => {
  const b = normalizeBoard({ columns: [{ id: "c1", name: "A", color: COLORS[0] }, { id: "c2", name: "B", color: "hotpink" }, { id: "c3", name: "C" }], cards: [] }, names);
  assert.deepEqual(b.columns.map((c) => c.color), [COLORS[0], null, null]);
});

test("moveColumn reorders columns, clamps the index and keeps cards", () => {
  let b = mk();
  b = addCard(b, b.columns[0].id, { title: "A" });
  const [c0, c1, c2] = b.columns.map((c) => c.id);
  const order = (x) => x.columns.map((c) => c.id);
  assert.deepEqual(order(moveColumn(b, c2, 0)), [c2, c0, c1]);
  assert.deepEqual(order(moveColumn(b, c0, 1)), [c1, c0, c2]);
  assert.deepEqual(order(moveColumn(b, c0, 99)), [c1, c2, c0]); // sınırı aşarsa sona
  assert.deepEqual(order(moveColumn(b, c1, -5)), [c1, c0, c2]); // negatifse başa
  assert.equal(moveColumn(b, "ghost", 0), b);
  assert.deepEqual(moveColumn(b, c0, 2).cards, b.cards);
});
