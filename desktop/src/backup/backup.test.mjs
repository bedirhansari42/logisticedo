import test from "node:test";
import assert from "node:assert/strict";
import { createBackup, validateBackup, planRestore, BACKUP_VERSION, LOCAL_KEYS } from "./backup.mjs";

const snap = (o = {}) => ({ letterheads: [], shipments: [], kv: {}, local: {}, ...o });
const roundtrip = async (b) => JSON.parse(JSON.stringify(b));
const bytes = async (blob) => [...new Uint8Array(await blob.arrayBuffer())];
const S = (o) => ({ state: {}, ...o }); // sevkiyat / proforma kaydı (state zorunlu)
const pdf = () => new Blob([new Uint8Array([1])], { type: "application/pdf" });
const L = (o) => ({ data: pdf(), ...o }); // antet kaydı (data Blob'u zorunlu)

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
  const b = await createBackup(snap({ shipments: [S({ id: "s1" }), S({ id: "s2" })], letterheads: [L({ id: "l" })], kv: { companies: [{ id: "c1" }] } }), { now: 1000, appVersion: "1.2.3" });
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
  const backup = await roundtrip(await createBackup(snap({ shipments: [S({ id: "new", updatedAt: 1 }), S({ id: "both-newer-in-file", updatedAt: 20, v: "file" }), S({ id: "both-older-in-file", updatedAt: 5, v: "file" })] })));
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
  const b = await roundtrip(await createBackup(snap({ shipments: [S({ id: "s1" })] })));
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
  const file = [S({ id: "new", updatedAt: 1 }), S({ id: "newer-in-file", updatedAt: 20, v: "file" }), S({ id: "older-in-file", updatedAt: 5, v: "file" })];
  const local = [{ id: "newer-in-file", updatedAt: 10, v: "local" }, { id: "older-in-file", updatedAt: 9, v: "local" }, { id: "only-local", updatedAt: 1 }];
  const plan = await planRestore(await roundtrip(await createBackup(snap({ proformas: file }))), snap({ proformas: local }));
  assert.deepEqual(plan.proformas.map((r) => [r.id, r.v]).sort(), [["new", undefined], ["newer-in-file", "file"]]);
  assert.deepEqual(plan.counts.proformas, { added: 1, updated: 1, kept: 1 });
});

test("an imported proforma's original file blob survives the round trip", async () => {
  const rec = { id: "p", updatedAt: 1, state: {}, file: { name: "a.pdf", type: "application/pdf", size: 3, blob: new Blob([new Uint8Array([1, 2, 3])], { type: "application/pdf" }) } };
  const plan = await planRestore(await roundtrip(await createBackup(snap({ proformas: [rec] }))), snap());
  const got = plan.proformas[0].file;
  assert.equal(got.blob instanceof Blob, true);
  assert.equal(got.blob.size, 3);
  assert.equal(got.name, "a.pdf");
});

// ---- Bozuk / el yapımı yedekler (güvenlik run-2: restore-unvalidated-record-shape) ----
const NOW = 1_000_000;
const plan0 = async (data, current = snap()) => planRestore(await roundtrip(await createBackup(snap(data))), current, { now: NOW });

test("records without a usable id are skipped and counted", async () => {
  const plan = await plan0({ shipments: [S({ id: "" }), S({ id: 5 }), S({ id: "x".repeat(500) }), "str", null, [1], S({ id: "ok" })] });
  assert.deepEqual(plan.shipments.map((r) => r.id), ["ok"]);
  assert.equal(plan.skipped, 6);
});

test("shipments and proformas without an object state are skipped", async () => {
  const plan = await plan0({ shipments: [{ id: "a" }, { id: "b", state: "x" }, { id: "c", state: [] }], proformas: [{ id: "p", state: null }] });
  assert.deepEqual([plan.shipments, plan.proformas], [[], []]);
  assert.equal(plan.skipped, 4);
});

test("summary keeps only primitive fields and string arrays (a React child cannot be an object)", async () => {
  const plan = await plan0({ shipments: [S({ id: "s", summary: { buyer: { evil: 1 }, invoiceNo: "INV-1", total: 12.5, foc: false, missing: ["a", "b"], bad: [{}], obj: {} } })] });
  assert.deepEqual(plan.shipments[0].summary, { invoiceNo: "INV-1", total: 12.5, foc: false, missing: ["a", "b"] });
});

test("a summary that is not an object becomes empty", async () => {
  const plan = await plan0({ proformas: [S({ id: "p", summary: "x" })] });
  assert.deepEqual(plan.proformas[0].summary, {});
});

test("listed text fields that are not strings are dropped", async () => {
  const plan = await plan0({ shipments: [S({ id: "s", status: { a: 1 }, lhId: 3, companyId: "c", proformaId: null })] });
  const r = plan.shipments[0];
  assert.equal("status" in r, false);
  assert.equal("lhId" in r, false);
  assert.equal(r.companyId, "c");
  assert.equal(r.proformaId, null);
});

test("auto must be a list of strings", async () => {
  const plan = await plan0({ shipments: [S({ id: "a", auto: "x" }), S({ id: "b", auto: ["m", 1, {}] })] });
  assert.deepEqual(plan.shipments.map((r) => r.auto), [[], ["m"]]);
});

test("future timestamps are clamped to now so a crafted record cannot win every later merge", async () => {
  const plan = await plan0({ shipments: [S({ id: "f", updatedAt: NOW * 10, createdAt: NOW * 10 }), S({ id: "g", updatedAt: "x", createdAt: -5 })] });
  assert.deepEqual(plan.shipments.map((r) => [r.updatedAt, r.createdAt]), [[NOW, NOW], [0, 0]]);
});

test("a clamped future record still updates an older local copy but not a newer one", async () => {
  const plan = await plan0({ shipments: [S({ id: "a", updatedAt: NOW * 10 }), S({ id: "b", updatedAt: NOW * 10 })] }, snap({ shipments: [S({ id: "a", updatedAt: NOW - 1 }), S({ id: "b", updatedAt: NOW })] }));
  assert.deepEqual(plan.shipments.map((r) => r.id), ["a"]);
});

test("blobs are rebuilt only in known fields; elsewhere they become null", async () => {
  const blob = new Blob([new Uint8Array([1, 2])], { type: "image/png" });
  const plan = await plan0({ shipments: [S({ id: "s", parse: { x: blob }, state: { meta: { invoiceNo: blob } } })], letterheads: [L({ id: "l", extra: blob })] });
  assert.equal(plan.shipments[0].parse.x, null);
  assert.equal(plan.shipments[0].state.meta.invoiceNo, null);
  assert.equal(plan.letterheads[0].extra, null);
  assert.equal(plan.letterheads[0].data instanceof Blob, true);
});

test("letterheads need a PDF or PNG/JPEG data blob; preview must be an image", async () => {
  const mk = (type) => new Blob([new Uint8Array([1])], { type });
  const plan = await plan0({ letterheads: [
    { id: "none" },
    { id: "html", data: mk("text/html") },
    { id: "png", data: mk("image/png"), preview: mk("text/html") },
    { id: "pdf", data: mk("application/pdf"), preview: mk("image/jpeg") }
  ] });
  assert.deepEqual(plan.letterheads.map((l) => [l.id, l.data.type, l.preview?.type ?? null]), [["png", "image/png", null], ["pdf", "application/pdf", "image/jpeg"]]);
  assert.equal(plan.skipped, 2);
});

test("broken base64 does not throw: the letterhead is skipped", async () => {
  const b = await roundtrip(await createBackup(snap({ letterheads: [L({ id: "l" })] })));
  b.data.letterheads[0].data.__blob.b64 = "%%%not base64%%%";
  const plan = await planRestore(b, snap(), { now: NOW });
  assert.deepEqual(plan.letterheads, []);
  assert.equal(plan.skipped, 1);
});

test("a proforma's original file is kept only with a real blob; odd MIME types are neutralised", async () => {
  const mk = (type) => new Blob([new Uint8Array([1, 2, 3])], { type });
  const plan = await plan0({ proformas: [
    S({ id: "a", file: { name: "a.pdf", type: "application/pdf", size: 3, blob: mk("application/pdf") } }),
    S({ id: "b", file: { name: { x: 1 }, type: "x", size: "big", blob: mk("text/html; charset=<x>") } }),
    S({ id: "c", file: { name: "c.pdf", blob: "nope" } }),
    S({ id: "d", file: "x" })
  ] });
  const f = Object.fromEntries(plan.proformas.map((p) => [p.id, p.file]));
  assert.equal(f.a.blob.type, "application/pdf");
  assert.deepEqual([f.b.name, f.b.type, f.b.size, f.b.blob.type, f.b.blob.size], ["", "application/octet-stream", 3, "application/octet-stream", 3]);
  assert.equal(f.c, null);
  assert.equal(f.d, null);
});

test("companies need an id; name and bank fields are coerced to text", async () => {
  const plan = await plan0({ kv: { companies: [{ name: "no id" }, { id: "c1", name: { x: 1 }, banks: "x" }, { id: "c2", name: "Ok", banks: [{ id: "b1", iban: 5, currency: "EUR" }, "x", { iban: "no id" }] }] } });
  assert.deepEqual(plan.kv.companies.map((c) => [c.id, c.name, c.banks]), [["c1", "", []], ["c2", "Ok", [{ id: "b1", iban: "", currency: "EUR" }]]]);
  assert.equal(plan.skipped, 1);
});

test("scalar kv keys must be strings", async () => {
  const plan = await plan0({ kv: { lhId: { a: 1 }, companyId: "c" } });
  assert.deepEqual(plan.kv, { companyId: "c" });
});

test("note cards and columns without an id are ignored", async () => {
  const file = { columns: [{ id: "c1", name: "A" }, { name: "no id" }], cards: [card("k1", "c1", 1, "x"), { title: "no id" }, "x"] };
  const plan = await plan0({ kv: { notes: file } }, snap({ kv: { notes: board([], []) } }));
  assert.deepEqual(plan.kv.notes.columns.map((c) => c.id), ["c1"]);
  assert.deepEqual(plan.kv.notes.cards.map((c) => c.id), ["k1"]);
});

test("a well-formed record passes through unchanged (apart from timestamps)", async () => {
  const rec = { id: "s", status: "draft", lhId: null, companyId: "c", bankId: null, bankAuto: true, proformaId: null, createdAt: 5, updatedAt: 6, lang: "tr", state: { meta: { invoiceNo: "1" } }, auto: ["meta.invoiceNo"], parse: null, summary: { invoiceNo: "1", total: 3, missing: [] } };
  const plan = await plan0({ shipments: [rec] });
  assert.deepEqual(plan.shipments[0], rec);
  assert.equal(plan.skipped, 0);
});

test("company and note card timestamps are clamped too", async () => {
  const plan = await plan0({ kv: { companies: [{ id: "c", name: "A", updatedAt: NOW * 9 }], notes: board([["c1", "A"]], [card("k", "c1", NOW * 9, "t")]) } });
  assert.equal(plan.kv.companies[0].updatedAt, NOW);
  assert.equal(plan.kv.notes.cards[0].updatedAt, NOW);
});

// ---- Palet yapısı yedekte (2026-11-26 palet yeniden tasarımı) ----
globalThis.localStorage ??= { getItem: () => null, setItem() {} };
globalThis.document ??= { querySelectorAll: () => [], documentElement: { dataset: {} }, title: "" };
const { normalizePallets } = await import("../../../assets/js/app/pallets.js");
const shipWith = (pallets) => S({ id: "s", updatedAt: 1, state: { pallets } });
const restoredPallets = async (pallets) => normalizePallets((await plan0({ shipments: [shipWith(pallets)] })).shipments[0].state.pallets);

test("pallet lines survive backup → restore → normalize", async () => {
  const out = await restoredPallets([{ id: "p1", no: "1", type: "PALLET", contents: "", dimensions: "120x80x150", net: "", gross: "335", lines: [{ id: "l1", itemId: "a", cartons: "5", qty: "" }] }]);
  assert.deepEqual(out[0].lines, [{ id: "l1", itemId: "a", cartons: "5", qty: "" }]);
  assert.deepEqual([out[0].id, out[0].gross, out[0].dimensions], ["p1", "335", "120x80x150"]);
});

test("old-format pallets from a backup open without loss", async () => {
  const out = await restoredPallets([{ no: "1", contents: "Pumps" }]);
  assert.equal(out[0].contents, "Pumps");
  assert.deepEqual(out[0].lines, []);
});

test("corrupt pallet lines from a backup are dropped, not fatal", async () => {
  const out = await restoredPallets([{ no: "1", lines: "x" }, { no: "2", lines: [5, { itemId: {} }, null] }]);
  assert.deepEqual(out.map((p) => p.lines), [[], []]);
});
