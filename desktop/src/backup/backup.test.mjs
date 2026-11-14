import test from "node:test";
import assert from "node:assert/strict";
import { createBackup, validateBackup, planRestore, BACKUP_VERSION, LOCAL_KEYS } from "./backup.mjs";

const snap = (o = {}) => ({ letterheads: [], shipments: [], kv: {}, local: {}, ...o });
const roundtrip = async (b) => JSON.parse(JSON.stringify(b));
const bytes = async (blob) => [...new Uint8Array(await blob.arrayBuffer())];

test("blobs survive a JSON round trip with type and bytes", async () => {
  const lh = { id: "a", name: "Antet", updatedAt: 5, data: new Blob([new Uint8Array([0, 1, 2, 250, 255])], { type: "application/pdf" }), preview: new Blob([new Uint8Array([9, 8])], { type: "image/jpeg" }), thumb: "data:image/jpeg;base64,xx" };
  const back = await roundtrip(await createBackup(snap({ letterheads: [lh] })));
  const v = validateBackup(back);
  assert.equal(v.ok, true);
  const plan = await planRestore(back, snap());
  const got = plan.letterheads[0];
  assert.equal(got.data.type, "application/pdf");
  assert.deepEqual(await bytes(got.data), [0, 1, 2, 250, 255]);
  assert.deepEqual(await bytes(got.preview), [9, 8]);
  assert.equal(got.thumb, lh.thumb);
});

test("large blobs encode (no call stack overflow)", async () => {
  const big = new Blob([new Uint8Array(2_000_000).fill(7)], { type: "image/png" });
  const back = await roundtrip(await createBackup(snap({ letterheads: [{ id: "b", data: big }] })));
  const plan = await planRestore(back, snap());
  assert.equal(plan.letterheads[0].data.size, 2_000_000);
});

test("backup has format, version and a summary", async () => {
  const b = await createBackup(snap({ shipments: [{ id: "s1" }, { id: "s2" }], letterheads: [{ id: "l" }], kv: { companies: [{ id: "c1" }] } }), { now: 1000, appVersion: "1.2.3" });
  assert.deepEqual([b.format, b.version, b.createdAt, b.appVersion], ["logisticedo-backup", BACKUP_VERSION, 1000, "1.2.3"]);
  assert.deepEqual(validateBackup(b).summary, { shipments: 2, letterheads: 1, companies: 1, notes: 0, proformas: 0 });
});

test("invalid files are rejected with a message key", async () => {
  const good = await createBackup(snap());
  for (const bad of [null, "x", [], {}, { ...good, format: "other" }, { ...good, data: null }, { ...good, data: { ...good.data, shipments: "no" } }]) {
    const v = validateBackup(bad);
    assert.equal(v.ok, false);
    assert.equal(v.key, "d.bk.err.format");
  }
  assert.deepEqual(validateBackup({ ...good, version: BACKUP_VERSION + 1 }), { ok: false, key: "d.bk.err.newer" });
});

test("restore adds missing records and keeps the newer one", async () => {
  const backup = await roundtrip(await createBackup(snap({ shipments: [{ id: "new", updatedAt: 1 }, { id: "both-newer-in-file", updatedAt: 20, v: "file" }, { id: "both-older-in-file", updatedAt: 5, v: "file" }] })));
  const current = snap({ shipments: [{ id: "both-newer-in-file", updatedAt: 10, v: "local" }, { id: "both-older-in-file", updatedAt: 9, v: "local" }, { id: "only-local", updatedAt: 1 }] });
  const plan = await planRestore(backup, current);
  assert.deepEqual(plan.shipments.map((s) => [s.id, s.v]).sort(), [["both-newer-in-file", "file"], ["new", undefined]]);
  assert.deepEqual(plan.counts.shipments, { added: 1, updated: 1, kept: 1 });
});

test("restore never deletes: local-only records are not in the plan", async () => {
  const plan = await planRestore(await roundtrip(await createBackup(snap())), snap({ shipments: [{ id: "x" }] }));
  assert.deepEqual(plan.shipments, []);
});

test("companies merge by id; scalar kv keys only fill gaps", async () => {
  const backup = await roundtrip(await createBackup(snap({ kv: { companies: [{ id: "c1", name: "File" }, { id: "c2", name: "New" }], lhId: "lhFile", companyId: "c1" } })));
  const plan = await planRestore(backup, snap({ kv: { companies: [{ id: "c1", name: "Local" }], lhId: "lhLocal" } }));
  assert.deepEqual(plan.kv.companies.map((c) => [c.id, c.name]), [["c1", "Local"], ["c2", "New"]]);
  assert.equal(plan.kv.lhId, undefined);
  assert.equal(plan.kv.companyId, "c1");
});

test("only whitelisted local keys are restored", async () => {
  const backup = await roundtrip(await createBackup(snap({ local: { "lgx.theme": "light", "lgx.planner": "{}", evil: "x", "lgx.other": "y" } })));
  const plan = await planRestore(backup, snap());
  assert.deepEqual(Object.keys(plan.local).sort(), ["lgx.planner", "lgx.theme"]);
  assert.ok(LOCAL_KEYS.includes("lgx.landed"));
});

test("createBackup and planRestore do not mutate their inputs", async () => {
  const s = snap({ shipments: [{ id: "s", updatedAt: 1 }], kv: { companies: [{ id: "c" }] } });
  const before = JSON.stringify(s);
  const b = await createBackup(s);
  await planRestore(await roundtrip(b), s);
  assert.equal(JSON.stringify(s), before);
});

// ---- Notlar (kanban) ----
const board = (cols, cards) => ({ columns: cols.map(([id, name]) => ({ id, name })), cards });
const card = (id, columnId, updatedAt, title) => ({ id, columnId, title, note: "", label: null, due: null, order: 1, createdAt: 1, updatedAt });

test("notes count appears in the summary", async () => {
  const b = await createBackup(snap({ kv: { notes: board([["c1", "A"]], [card("k1", "c1", 1, "x"), card("k2", "c1", 1, "y")]) } }));
  assert.equal(validateBackup(b).summary.notes, 2);
});

test("restoring notes merges columns and cards: newer card wins, local-only kept, nothing deleted", async () => {
  const local = board([["c1", "Local A"], ["c3", "Only local"]], [card("k1", "c1", 10, "local"), card("k9", "c3", 5, "only local")]);
  const file = board([["c1", "File A"], ["c2", "File B"]], [card("k1", "c1", 20, "file"), card("k2", "c2", 1, "new")]);
  const plan = await planRestore(await roundtrip(await createBackup(snap({ kv: { notes: file } }))), snap({ kv: { notes: local } }));
  const n = plan.kv.notes;
  assert.deepEqual(n.columns.map((c) => [c.id, c.name]), [["c1", "Local A"], ["c3", "Only local"], ["c2", "File B"]]);
  assert.deepEqual(n.cards.map((c) => [c.id, c.title]).sort(), [["k1", "file"], ["k2", "new"], ["k9", "only local"]]);
  assert.deepEqual(plan.counts.notes, { added: 1, updated: 1, kept: 0 });
});

test("an older card in the file does not overwrite a newer local one", async () => {
  const local = board([["c1", "A"]], [card("k1", "c1", 30, "local")]);
  const file = board([["c1", "A"]], [card("k1", "c1", 20, "file")]);
  const plan = await planRestore(await roundtrip(await createBackup(snap({ kv: { notes: file } }))), snap({ kv: { notes: local } }));
  assert.equal(plan.kv.notes, undefined);
  assert.deepEqual(plan.counts.notes, { added: 0, updated: 0, kept: 1 });
});

test("with no local notes the file's board is restored as is", async () => {
  const file = board([["c1", "A"]], [card("k1", "c1", 20, "file")]);
  const plan = await planRestore(await roundtrip(await createBackup(snap({ kv: { notes: file } }))), snap());
  assert.deepEqual(plan.kv.notes, file);
});

// ---- Proformalar ----
test("proformas are counted in the summary", async () => {
  const b = await createBackup(snap({ proformas: [{ id: "p1" }, { id: "p2" }] }));
  assert.equal(validateBackup(b).summary.proformas, 2);
});

test("an old backup without a proformas key still validates and restores", async () => {
  const b = await roundtrip(await createBackup(snap({ shipments: [{ id: "s1" }] })));
  delete b.data.proformas;
  const v = validateBackup(b);
  assert.equal(v.ok, true);
  assert.equal(v.summary.proformas, 0);
  const plan = await planRestore(b, snap());
  assert.deepEqual(plan.proformas, []);
  assert.equal(plan.shipments.length, 1);
});

test("a non-array proformas key is rejected", async () => {
  const b = await roundtrip(await createBackup(snap()));
  b.data.proformas = "x";
  assert.equal(validateBackup(b).ok, false);
});

test("proformas merge by id: new added, newer updated, local-only kept", async () => {
  const file = [{ id: "new", updatedAt: 1 }, { id: "newer-in-file", updatedAt: 20, v: "file" }, { id: "older-in-file", updatedAt: 5, v: "file" }];
  const local = [{ id: "newer-in-file", updatedAt: 10, v: "local" }, { id: "older-in-file", updatedAt: 9, v: "local" }, { id: "only-local", updatedAt: 1 }];
  const plan = await planRestore(await roundtrip(await createBackup(snap({ proformas: file }))), snap({ proformas: local }));
  assert.deepEqual(plan.proformas.map((r) => [r.id, r.v]).sort(), [["new", undefined], ["newer-in-file", "file"]]);
  assert.deepEqual(plan.counts.proformas, { added: 1, updated: 1, kept: 1 });
});

test("an imported proforma's original file blob survives the round trip", async () => {
  const rec = { id: "p", updatedAt: 1, file: { name: "a.pdf", type: "application/pdf", size: 3, blob: new Blob([new Uint8Array([1, 2, 3])], { type: "application/pdf" }) } };
  const plan = await planRestore(await roundtrip(await createBackup(snap({ proformas: [rec] }))), snap());
  const got = plan.proformas[0].file;
  assert.equal(got.blob instanceof Blob, true);
  assert.equal(got.blob.size, 3);
  assert.equal(got.name, "a.pdf");
});
