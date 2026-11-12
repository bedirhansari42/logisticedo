/* Belge oluşturucu: arayüz denetleyicisi */
import { initCommon, toast, ICONS } from "../common.js";
import { t, getLang, onLangChange, applyI18n } from "../i18n.js";
import * as store from "./store.js";
import { processLetterheadFile } from "./letterhead.js";
import { parseProforma } from "./parse/index.js";
import { normUnit } from "./parse/normalize.js";
import {
  createEmptyState, newItem, newPallet, palletsFromItems, num, toInput, uiDec, lineAmount, isAmountComputed, computeTotals, distribute,
  fmtUi, missingFields, hasAnyContent, relocalize, INCOTERMS, TRANSPORT_MODES, CURRENCIES, UNITS, PACKAGE_TYPES,
  safeFileName, round
} from "./doc-model.js";
import { buildPdf } from "./pdf-builder.js";
import { buildXlsx } from "./excel-builder.js";
import { renderPdfInto } from "./preview.js";
import { canDownload } from "./access.js";

initCommon();

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const PT_PER_MM = 72 / 25.4;

const app = {
  pdfBytes: null,
  state: createEmptyState(),
  auto: new Set(),
  letterheads: [],
  lhId: "none",
  lh: null,
  view: "invoice",
  doc: "ci",
  persistent: true,
  started: false,
  lastParse: null
};

const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
function setPath(o, p, v) {
  const ks = p.split(".");
  let cur = o;
  for (let i = 0; i < ks.length - 1; i++) cur = cur[ks[i]];
  cur[ks[ks.length - 1]] = v;
}

/* ========================================================== Başlangıç */

init();

async function init() {
  fillStaticOptions();
  bindForm();
  bindItems();
  bindPallets();
  bindNumericGuard();
  bindLetterheadUi();
  bindProformaUi();
  bindPreviewUi();
  bindDialog();

  app.persistent = await store.isPersistentAvailable();
  if (!app.persistent) $("#lhStorageNote").textContent = t("lh.storageFail");

  app.letterheads = await store.listLetterheads();
  const savedId = await store.kvGet("lhId");
  if (savedId && savedId !== "none" && app.letterheads.some((l) => l.id === savedId)) {
    app.lhId = savedId;
    app.lh = app.letterheads.find((l) => l.id === savedId);
  }
  renderLhList();

  // Kalıcı depoda (IndexedDB) yalnızca antet durur; eski sürümlerden kalmış taslak varsa silinir
  store.kvDel("draft").catch(() => {});

  // Çalışılan belge yalnızca oturum boyunca (sayfa yenilenince kalır, sekme/tarayıcı kapanınca silinir)
  const draft = loadDraft();
  if (draft && hasAnyContent(draft.state)) {
    app.state = migrate(draft.state);
    if (draft.lang && draft.lang !== getLang()) relocalize(app.state, draft.lang, getLang());
    app.auto = new Set(draft.auto || []);
    startWorkspace(false);
    toast(t("ws.draftRestored"), "info");
  }

  onLangChange((lang, prev) => {
    relocalize(app.state, prev, lang);
    fillStaticOptions();
    renderLhList();
    if (!app.persistent) $("#lhStorageNote").textContent = t("lh.storageFail");
    if (app.lastParse) showParseResult(app.lastParse.name, app.lastParse.res);
    if (app.started) { fillForm(); schedulePreview(60); }
  });

  // Sayfa dışına bırakılan dosyalar tarayıcıyı başka sayfaya götürmesin
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());
}

function fillStaticOptions() {
  const inco = $("#f_inco");
  const curInco = app.state.shipment.incoterm;
  inco.replaceChildren(new Option(t("f.none"), ""), ...INCOTERMS.map((c) => new Option(c, c)));
  inco.value = curInco || "";
  const tm = $("#f_tm");
  const curTm = app.state.shipment.transportMode;
  tm.replaceChildren(new Option(t("f.none"), ""), ...TRANSPORT_MODES.map(([v, k]) => new Option(`${t(k)} · ${v}`, v)));
  if (curTm && !TRANSPORT_MODES.some(([v]) => v === curTm)) tm.append(new Option(curTm, curTm));
  tm.value = curTm || "";
  $("#dl-currency").replaceChildren(...CURRENCIES.map((c) => new Option(c)));
  $("#dl-unit").replaceChildren(...UNITS.map((c) => new Option(c)));
  $("#dl-pkg").replaceChildren(...PACKAGE_TYPES.map((c) => new Option(c)));
}

/* ========================================================== Form */

function fillForm() {
  fillStaticOptions();
  for (const el of $$("[data-bind]")) {
    const v = getPath(app.state, el.dataset.bind);
    if (el.type === "checkbox") el.checked = !!v;
    else el.value = v ?? "";
    el.classList.toggle("is-auto", app.auto.has(el.dataset.bind));
  }
  syncConditional();
  renderItems();
  renderPallets();
  updateTotals();
}

function syncConditional() {
  $("#consigneeFields").hidden = !!app.state.consignee.same;
  $("#notifyFields").hidden = !app.state.notify.enabled;
  $("#bankFields").classList.toggle("is-off", !app.state.bank.show);
  $("#declField").hidden = !app.state.sign.showDeclaration;
  $("#paperField").hidden = !!app.lh;
}

/* Sayı alanlarına (inputmode="decimal") harf girilemez: yazarken engellenir, yapıştırılan metin temizlenir */
const NUM_ALLOWED = /^[\d.,\-]*$/;
function bindNumericGuard() {
  const isNum = (el) => el && el.tagName === "INPUT" && el.getAttribute("inputmode") === "decimal";
  document.addEventListener("beforeinput", (e) => {
    if (!isNum(e.target) || e.inputType.startsWith("delete") || e.inputType === "historyUndo" || e.inputType === "historyRedo") return;
    if (e.data && !NUM_ALLOWED.test(e.data)) e.preventDefault();
  }, true);
  // Yapıştırma, sürükle-bırak ve otomatik doldurma için yedek temizlik (diğer dinleyicilerden önce çalışır)
  document.addEventListener("input", (e) => {
    const el = e.target;
    if (!isNum(el) || NUM_ALLOWED.test(el.value)) return;
    const pos = el.selectionStart;
    const clean = el.value.replace(/[^\d.,\-]/g, "");
    const removed = el.value.slice(0, pos ?? 0).replace(/[\d.,\-]/g, "").length;
    el.value = clean;
    try { el.setSelectionRange(Math.max(0, (pos ?? clean.length) - removed), Math.max(0, (pos ?? clean.length) - removed)); } catch { /* yoksay */ }
  }, true);
}

function bindForm() {
  const form = $("#docForm");
  const handle = (e) => {
    const el = e.target;
    if (!el.dataset || !el.dataset.bind) return;
    const isToggle = el.type === "checkbox" || el.tagName === "SELECT" || el.type === "date";
    if (e.type === "input" && isToggle && el.type !== "date") return;
    if (e.type === "change" && !isToggle) return;
    let v = el.type === "checkbox" ? el.checked : el.value;
    if (el.dataset.bind === "meta.currency" || el.dataset.bind === "packing.packageType") {
      const up = String(v).toUpperCase();
      if (up !== v) { const pos = el.selectionStart; el.value = up; v = up; try { el.setSelectionRange(pos, pos); } catch { /* yoksay */ } }
    }
    setPath(app.state, el.dataset.bind, v);
    if (app.auto.delete(el.dataset.bind)) el.classList.remove("is-auto");
    if (isToggle) syncConditional();
    if (el.dataset.bind === "meta.currency") renderItems();
    // Ek tutarlardaki KDV oranı tüm kalemlere uygulanır (kalemdeki oran bunun önüne geçtiği için)
    if (el.dataset.bind === "charges.vatRate") {
      for (const it of app.state.items) { it.vatRate = v; app.auto.delete(`item:${it.id}:vatRate`); }
      renderItems();
    }
    updateTotals();
    changed();
  };
  form.addEventListener("input", handle);
  form.addEventListener("change", handle);

  $("#distApply").addEventListener("click", () => {
    const n = distribute(app.state, $("#distBasis").value);
    if (n === -1) { toast(t("dist.nothing"), "warn"); return; }
    if (!n) { toast(t("it.empty"), "warn"); return; }
    for (const it of app.state.items) ["packages", "netWeight", "grossWeight", "volume", "packageType"].forEach((f) => app.auto.delete(`item:${it.id}:${f}`));
    renderItems();
    updateTotals();
    changed();
    toast(t("dist.done", { n }));
    setItemView("packing");
  });

  $("#resetDoc").addEventListener("click", async () => {
    if (!window.confirm(t("ws.confirmReset"))) return;
    app.state = freshState();
    app.auto = new Set();
    app.lastParse = null;
    $("#pfResult").hidden = true;
    fillForm();
    schedulePreview(30);
  });
}

/* Yeni belge. Satıcı/banka: önce seçili antetin profili; keepCompany ise (elle yeni belge) önceki belgeninki.
   Proforma yüklenirken keepCompany=false: önceki belgenin firması yeni belgeye taşınmaz. */
function freshState(prev = app.state, { keepCompany = true } = {}) {
  const s = createEmptyState();
  const prof = app.lh?.profile;
  const has = (o) => !!o && Object.entries(o).some(([k, v]) => k !== "show" && typeof v === "string" && v.trim());
  const seller = has(prof?.seller) ? prof.seller : keepCompany && has(prev?.seller) ? prev.seller : null;
  if (seller) s.seller = { ...s.seller, ...seller };
  const bank = has(prof?.bank) ? prof.bank : keepCompany && has(prev?.bank) ? prev.bank : null;
  if (bank) s.bank = { ...s.bank, ...bank };
  const sign = prof?.sign || prev?.sign;
  if (sign) s.sign = { ...s.sign, name: sign.name || "", title: sign.title || "", place: sign.place || "", declaration: sign.declaration || s.sign.declaration, showDeclaration: sign.showDeclaration ?? true };
  if (prev?.options) s.options = { ...s.options, ...prev.options };
  if (prev?.packing?.packageType) s.packing.packageType = prev.packing.packageType;
  return s;
}

/* ========================================================== Kalemler */

const NUMERIC_ITEM_FIELDS = new Set(["qty", "unitPrice", "vatRate", "amount", "packages", "netWeight", "grossWeight", "volume"]);

const ITEM_COLS = {
  invoice: [
    ["code", "it.code", "text", "w-code"],
    ["description", "it.desc", "area", "w-desc"],
    ["hsCode", "it.hs", "text", "w-hs"],
    ["origin", "it.origin", "text", "w-origin"],
    ["qty", "it.qty", "num", "w-num"],
    ["unit", "it.unit", "text", "w-unit", "dl-unit"],
    ["unitPrice", "it.price", "num", "w-num"],
    ["currency", "it.cur", "text", "w-cur", "dl-currency"],
    ["vatRate", "it.vatRate", "num", "w-vat"],
    ["amount", "it.amount", "amount", "w-amt"]
  ],
  packing: [
    ["description", "it.desc", "area", "w-desc"],
    ["packages", "it.pkgs", "num", "w-num"],
    ["packageType", "it.pkgType", "text", "w-ptype", "dl-pkg"],
    ["netWeight", "it.net", "num", "w-num"],
    ["grossWeight", "it.gross", "num", "w-num"],
    ["dimensions", "it.dims", "text", "w-dims"],
    ["volume", "it.vol", "num", "w-num"]
  ]
};

function setItemView(view) {
  app.view = view;
  $$("#itemView button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === view)));
  renderItems();
}

function visibleCols() {
  const showCode = app.state.items.some((it) => it.code);
  return ITEM_COLS[app.view].filter(([f]) => f !== "code" || showCode);
}

function renderItems() {
  const cols = visibleCols();
  const table = $("#itemsTable");
  const head = document.createElement("tr");
  head.append(th(t("it.no"), "it-no"));
  const cur = (app.state.meta.currency || "").trim().toUpperCase();
  cols.forEach(([, key, , cls]) => head.append(th(t(key), cls)));
  head.append(th("", "it-act"));
  table.tHead.replaceChildren(head);

  const body = table.tBodies[0];
  const rows = [];
  if (!app.state.items.length) {
    const tr = document.createElement("tr");
    tr.className = "it-empty";
    const td = document.createElement("td");
    td.colSpan = cols.length + 2;
    td.textContent = t("it.empty");
    tr.append(td);
    rows.push(tr);
  }
  app.state.items.forEach((it, i) => {
    const tr = document.createElement("tr");
    tr.dataset.id = it.id;
    const no = document.createElement("td");
    no.className = "it-no";
    no.textContent = String(i + 1);
    tr.append(no);
    for (const [field, key, type, cls, list] of cols) {
      const td = document.createElement("td");
      td.className = cls;
      let el;
      if (type === "area") {
        el = document.createElement("textarea");
        el.rows = 1;
        el.value = it[field] ?? "";
      } else {
        el = document.createElement("input");
        el.type = "text";
        if (type === "num" || type === "amount") { el.inputMode = "decimal"; el.classList.add("num"); }
        if (list) el.setAttribute("list", list);
        if (type === "amount") setAmountInput(el, it);
        else el.value = it[field] ?? "";
        if (field === "currency") { el.placeholder = cur; el.classList.add("cur"); }
        if (field === "origin") el.placeholder = app.state.shipment.countryOrigin;
        if (field === "vatRate") el.placeholder = app.state.charges.vatRate || "0";
      }
      el.dataset.item = field;
      el.setAttribute("aria-label", `${t(key)} ${i + 1}`);
      if (app.auto.has(`item:${it.id}:${field}`)) el.classList.add("is-auto");
      td.append(el);
      tr.append(td);
    }
    const act = document.createElement("td");
    act.className = "it-act";
    act.append(iconBtn(ICONS.copy, t("it.dup"), "dup"), iconBtn(ICONS.trash, t("it.remove"), "del", "icon-btn--danger"));
    tr.append(act);
    rows.push(tr);
  });
  body.replaceChildren(...rows);
  $$("textarea", body).forEach(autosize);
  $("#itemCount").textContent = app.state.items.length ? `· ${app.state.items.length}` : "";
}

function th(text, cls) {
  const el = document.createElement("th");
  el.textContent = text;
  if (cls) el.className = cls;
  return el;
}
function iconBtn(svg, label, act, extra = "") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `icon-btn icon-btn--plain ${extra}`.trim();
  b.dataset.act = act;
  b.setAttribute("aria-label", label);
  b.title = label;
  b.innerHTML = svg;
  return b;
}
function setAmountInput(el, it) {
  if (isAmountComputed(it)) {
    el.readOnly = true;
    el.value = fmtUi(lineAmount(it));
    el.tabIndex = -1;
  } else {
    el.readOnly = false;
    el.tabIndex = 0;
    if (document.activeElement !== el) el.value = it.amount ?? "";
  }
}
function autosize(el) {
  el.style.height = "auto";
  el.style.height = `${Math.max(36, el.scrollHeight + 2)}px`;
}

/* ========================================================== Palet listesi */

const PALLET_COLS = [
  ["no", "pal.no", "text", "w-pno"],
  ["type", "pal.type", "text", "w-ptype2", "dl-pkg"],
  ["contents", "pal.contents", "area", "w-desc"],
  ["dimensions", "pal.dims", "text", "w-dims"],
  ["net", "pal.net", "num", "w-num"],
  ["gross", "pal.gross", "num", "w-num"]
];

function renderPallets() {
  const table = $("#palletTable");
  const head = document.createElement("tr");
  PALLET_COLS.forEach(([, key, , cls]) => head.append(th(t(key), cls)));
  head.append(th("", "it-act"));
  table.tHead.replaceChildren(head);
  const rows = [];
  const pal = app.state.pallets;
  if (!pal.length) {
    const tr = document.createElement("tr");
    tr.className = "it-empty";
    const td = document.createElement("td");
    td.colSpan = PALLET_COLS.length + 1;
    td.textContent = t("pal.empty");
    tr.append(td);
    rows.push(tr);
  }
  pal.forEach((p, i) => {
    const tr = document.createElement("tr");
    tr.dataset.id = p.id;
    for (const [field, key, type, cls, list] of PALLET_COLS) {
      const td = document.createElement("td");
      td.className = cls;
      let el;
      if (type === "area") { el = document.createElement("textarea"); el.rows = 1; }
      else {
        el = document.createElement("input");
        el.type = "text";
        if (type === "num") { el.inputMode = "decimal"; el.classList.add("num"); }
        if (list) el.setAttribute("list", list);
      }
      el.value = p[field] ?? "";
      if (field === "no") el.placeholder = String(i + 1);
      el.dataset.pal = field;
      el.setAttribute("aria-label", `${t(key)} ${i + 1}`);
      td.append(el);
      tr.append(td);
    }
    const act = document.createElement("td");
    act.className = "it-act";
    act.append(iconBtn(ICONS.trash, t("pal.remove"), "del", "icon-btn--danger"));
    tr.append(act);
    rows.push(tr);
  });
  const body = table.tBodies[0];
  body.replaceChildren(...rows);
  $$("textarea", body).forEach(autosize);
  $("#palCount").textContent = pal.length ? t("pal.count", { n: pal.length }) : "";
}

function bindPallets() {
  const body = $("#palletTable tbody");
  body.addEventListener("input", (e) => {
    const el = e.target;
    const tr = el.closest("tr[data-id]");
    if (!tr || !el.dataset.pal) return;
    const p = app.state.pallets.find((x) => x.id === tr.dataset.id);
    if (!p) return;
    p[el.dataset.pal] = el.value;
    if (el.tagName === "TEXTAREA") autosize(el);
    changed();
  });
  body.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const idx = app.state.pallets.findIndex((x) => x.id === b.closest("tr").dataset.id);
    if (idx < 0) return;
    app.state.pallets.splice(idx, 1);
    renderPallets();
    changed();
  });
  $("#palAdd").addEventListener("click", () => {
    const pal = app.state.pallets;
    pal.push(newPallet({ no: String(pal.length + 1), type: (app.state.packing.packageType || "PALLET").replace(/S$/, "") }));
    renderPallets();
    changed();
    const rows = $$("#palletTable tbody tr[data-id]");
    rows[rows.length - 1]?.querySelector("textarea, input")?.focus();
  });
  $("#palFill").addEventListener("click", () => {
    if (!app.state.items.some((it) => it.description || it.qty)) { toast(t("pal.noItems"), "warn"); return; }
    if (app.state.pallets.length && !window.confirm(t("pal.confirmFill"))) return;
    palletsFromItems(app.state);
    renderPallets();
    changed();
  });
}

function bindItems() {
  $("#itemView").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-view]");
    if (b) setItemView(b.dataset.view);
  });
  $("#addItem").addEventListener("click", () => {
    const last = app.state.items[app.state.items.length - 1];
    app.state.items.push(newItem({ unit: last?.unit || "PCS", packageType: last?.packageType || "" }));
    renderItems();
    updateTotals();
    changed();
    const rows = $$("#itemsTable tbody tr[data-id]");
    rows[rows.length - 1]?.querySelector("textarea, input")?.focus();
  });

  const body = $("#itemsTable tbody");
  body.addEventListener("input", (e) => {
    const el = e.target;
    const tr = el.closest("tr[data-id]");
    if (!tr || !el.dataset.item) return;
    const it = app.state.items.find((x) => x.id === tr.dataset.id);
    if (!it) return;
    const f = el.dataset.item;
    if (f === "currency") { const up = el.value.toUpperCase(); if (up !== el.value) el.value = up; }
    it[f] = el.value;
    if (app.auto.delete(`item:${it.id}:${f}`)) el.classList.remove("is-auto");
    if (f === "qty" || f === "unitPrice") {
      const amt = tr.querySelector('input[data-item="amount"]');
      if (amt) setAmountInput(amt, it);
      if (isAmountComputed(it)) it.amount = toInput(lineAmount(it), uiDec(), 2);
    }
    if (el.tagName === "TEXTAREA") autosize(el);
    updateTotals();
    changed();
  });
  body.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const tr = b.closest("tr[data-id]");
    const idx = app.state.items.findIndex((x) => x.id === tr.dataset.id);
    if (idx < 0) return;
    if (b.dataset.act === "del") app.state.items.splice(idx, 1);
    else {
      const { id, ...copy } = app.state.items[idx];
      app.state.items.splice(idx + 1, 0, newItem(copy));
    }
    renderItems();
    updateTotals();
    changed();
  });
  body.addEventListener("paste", (e) => {
    const el = e.target;
    const tr = el.closest("tr[data-id]");
    if (!tr || !el.dataset.item) return;
    const text = e.clipboardData?.getData("text/plain") || "";
    if (!text.includes("\t") && !/\n.*\S/.test(text.trim())) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
    const cols = visibleCols().filter(([, , type]) => type !== "amount").map(([f]) => f);
    // Tam satır kopyalandıysa (sütun sayısı tabloya eşit ya da fazla) ilk sütundan başla; yoksa hücreden sağa doğru
    const width = Math.max(...lines.map((l) => l.split("\t").length));
    const start = width >= cols.length ? 0 : Math.max(0, cols.indexOf(el.dataset.item));
    let idx = app.state.items.findIndex((x) => x.id === tr.dataset.id);
    lines.forEach((line, k) => {
      let it = app.state.items[idx + k];
      if (!it) { it = newItem({ unit: app.state.items[idx]?.unit || "PCS" }); app.state.items.push(it); }
      line.split("\t").forEach((cell, j) => {
        const f = cols[start + j];
        if (!f) return;
        const v = cell.trim();
        it[f] = f === "unit" ? normUnit(v) || v.toUpperCase() : f === "packageType" || f === "currency" ? v.toUpperCase() : f === "vatRate" ? v.replace(/[%\s]/g, "") : NUMERIC_ITEM_FIELDS.has(f) ? v.replace(/[^\d.,\-]/g, "") : v;
      });
    });
    renderItems();
    updateTotals();
    changed();
    toast(t("it.pasted", { n: lines.length }));
  });
}

function updateTotals() {
  const T = computeTotals(app.state);
  const cur = (app.state.meta.currency || "").toUpperCase();
  const strip = $("#itemTotals");
  const parts = [
    [t("it.subtotal"), `${fmtUi(T.subtotal)} ${cur}`, true],
    [t("it.totPkgs"), T.packages ? fmtUi(T.packages, 0) : "–"],
    [t("it.totNet"), T.net ? `${fmtUi(T.net)} kg` : "–"],
    [t("it.totGross"), T.gross ? `${fmtUi(T.gross)} kg` : "–"],
    [t("it.totVol"), T.volume ? `${fmtUi(T.volume, 3)} m³` : "–"]
  ];
  strip.replaceChildren(...parts.map(([k, v, total]) => {
    const d = document.createElement("div");
    if (total) d.className = "is-total";
    const dt = document.createElement("dt"); dt.textContent = k;
    const dd = document.createElement("dd"); dd.textContent = v;
    d.append(dt, dd);
    return d;
  }));

  const cw = $("#curWarn");
  if (cw) cw.hidden = !T.mixedCurrency;

  const box = $("#chargeTotals");
  const lines = [[t("it.subtotal"), T.subtotal]];
  if (T.freight) lines.push([t("f.freight"), T.freight]);
  if (T.insurance) lines.push([t("f.insurance"), T.insurance]);
  if (T.other) lines.push([app.state.charges.otherLabel || t("f.other"), T.other]);
  if (T.discount) lines.push([t("f.discount"), -T.discount]);
  if (T.vat) lines.push([`${t("f.vatShort")}${T.vatRate ? ` (%${fmtUi(T.vatRate, 2).replace(/[.,]00$/, "")})` : ""}`, T.vat]);
  lines.push([t("it.total"), T.total, true]);
  box.replaceChildren(...lines.map(([k, v, total]) => {
    const d = document.createElement("div");
    if (total) d.className = "is-total";
    const dt = document.createElement("dt"); dt.textContent = k;
    const dd = document.createElement("dd"); dd.textContent = `${fmtUi(v)} ${cur}`;
    d.append(dt, dd);
    return d;
  }));

  const ph = (sel, v, d) => { const el = $(sel); if (el) el.placeholder = v ? fmtUi(v, d) : ""; };
  ph("#f_vat", T.vatCalc, 2);
  ph("#f_tp", T.itemPkgs, 0);
  ph("#f_tn", T.itemNet, 2);
  ph("#f_tg", T.itemGross, 2);
  ph("#f_tv", T.itemVol, 3);
}

/* ========================================================== Kaydet / önizleme zamanlaması */

/* Taslak: sessionStorage (sekme/tarayıcı kapanınca tarayıcı siler) */
const DRAFT_KEY = "lgx.draft";
function loadDraft() {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null"); } catch { return null; }
}
let draftTimer;
function scheduleDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    try {
      if (!hasAnyContent(app.state)) { sessionStorage.removeItem(DRAFT_KEY); return; }
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ state: app.state, auto: [...app.auto], lang: getLang() }));
    } catch { /* yoksay */ }
  }, 400);
}
function migrate(saved) {
  const base = createEmptyState();
  for (const k of Object.keys(base)) {
    if (saved[k] == null) continue;
    if (Array.isArray(base[k])) base[k] = saved[k];
    else if (typeof base[k] === "object") base[k] = { ...base[k], ...saved[k] };
    else base[k] = saved[k];
  }
  base.items = base.items.map((it) => ({ ...newItem(), ...it }));
  return base;
}

function changed() {
  schedulePreview();
}

let pvTimer = 0, pvBusy = false, pvAgain = false;
function schedulePreview(delay = 380) {
  if (!app.started) return;
  scheduleDraft();
  clearTimeout(pvTimer);
  pvTimer = setTimeout(runPreview, delay);
}

async function runPreview() {
  if (pvBusy) { pvAgain = true; return; }
  pvBusy = true;
  const loading = $("#pvLoading");
  const loadTimer = setTimeout(() => { loading.hidden = false; }, 180);
  try {
    const bytes = await buildPdf(app.state, app.lh, app.doc);
    app.pdfBytes = bytes;
    const n = await renderPdfInto($("#pvPages"), bytes);
    if (n != null) $("#pvMeta").textContent = n === 1 ? t("pv.page1") : t("pv.pages", { n });
  } catch (e) {
    console.error(e);
    const div = document.createElement("div");
    div.className = "pv-error";
    div.textContent = t("pv.error", { msg: e.message || String(e) });
    $("#pvPages").replaceChildren(div);
  } finally {
    clearTimeout(loadTimer);
    loading.hidden = true;
    pvBusy = false;
    renderIssues();
    if (pvAgain) { pvAgain = false; schedulePreview(40); }
  }
}

function renderIssues() {
  const miss = missingFields(app.state);
  const box = $("#pvIssues");
  if (!miss.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = ICONS.warn;
  const span = document.createElement("span");
  span.textContent = t("pv.missing", { list: miss.map((k) => t(k)).join(", ") });
  box.append(span);
}

function startWorkspace(scroll = true) {
  app.started = true;
  $("#workspace").hidden = false;
  fillForm();
  schedulePreview(30);
  if (scroll) setTimeout(() => $("#workspace").scrollIntoView({ behavior: "smooth", block: "start" }), 60);
}

/* ========================================================== Önizleme ve indirme */

async function openBigPreview() {
  const dialog = $("#pvDialog");
  $("#pvdTitle").textContent = $("#pvTitle").textContent;
  $("#pvdPages").replaceChildren();
  if (!dialog.open) dialog.showModal();
  const loading = $("#pvdLoading");
  loading.hidden = false;
  try {
    const bytes = app.pdfBytes || await buildPdf(app.state, app.lh, app.doc);
    await renderPdfInto($("#pvdPages"), bytes);
  } catch (e) {
    console.error(e);
    const div = document.createElement("div");
    div.className = "pv-error";
    div.textContent = t("pv.error", { msg: e.message || String(e) });
    $("#pvdPages").replaceChildren(div);
  } finally {
    loading.hidden = true;
  }
}

function syncPvTitle() {
  const sel = $("#pvDoc");
  sel.value = app.doc;
  $("#pvTitle").textContent = sel.selectedOptions[0]?.textContent || "";
}

function bindPreviewUi() {
  $("#pvDoc").addEventListener("change", (e) => {
    app.doc = e.target.value;
    syncPvTitle();
    schedulePreview(0);
  });
  syncPvTitle();
  // Önizleme görsellerinin sağ tık / sürükle-bırak ile kaydedilmesini engelle (indirme yalnızca indir düğmesiyle)
  for (const el of [$("#pvStage"), $("#pvdBody")]) {
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("dragstart", (e) => e.preventDefault());
    el.addEventListener("copy", (e) => e.preventDefault());
  }
  $("#pvOpen").addEventListener("click", openBigPreview);
  const pvd = $("#pvDialog");
  $("#pvdClose").addEventListener("click", () => pvd.close());
  $("#pvdDownload").addEventListener("click", (e) => download(app.doc, e.currentTarget));
  pvd.addEventListener("click", (e) => { if (e.target === pvd) pvd.close(); });
  pvd.addEventListener("close", () => $("#pvdPages").replaceChildren());
  $("#dlCurrent").addEventListener("click", (e) => download(app.doc, e.currentTarget));
  const menu = $("#dlMenu"), more = $("#dlMore");
  const setMenu = (open) => { menu.hidden = !open; more.setAttribute("aria-expanded", String(open)); };
  more.addEventListener("click", (e) => { e.stopPropagation(); setMenu(menu.hidden); });
  document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) setMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });
  $$("[data-dl]").forEach((b) => b.addEventListener("click", () => { setMenu(false); download(b.dataset.dl, b); }));
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => schedulePreview(0), 250); });
}

async function download(kind, btn) {
  if (!canDownload()) return;
  btn.disabled = true;
  try {
    const s = app.state;
    const base = safeFileName(s.meta.invoiceNo) || "document";
    let blob, name;
    if (kind === "xlsx") {
      blob = await buildXlsx(s);
      name = `CI-PL_${base}.xlsx`;
    } else {
      const bytes = await buildPdf(s, app.lh, kind);
      blob = new Blob([bytes], { type: "application/pdf" });
      const names = {
        ci: `Commercial-Invoice_${base}.pdf`,
        pl: `Packing-List_${safeFileName(s.meta.plNo) || base}.pdf`,
        si: `Shipping-Instruction_${safeFileName(s.ship.siNo) || base}.pdf`,
        bl: `BL-Draft_${safeFileName(s.ship.blNo) || base}.pdf`,
        origin: `Declaration-of-Origin_${safeFileName(s.origin.certNo) || base}.pdf`,
        loading: `Loading-Instruction_${base}.pdf`,
        coo: `Certificate-of-Origin-Request_${base}.pdf`,
        eur1: `EUR1-Request_${base}.pdf`,
        ins: `Insurance-Request_${base}.pdf`,
        trans: `Transport-Order_${base}.pdf`,
        prealert: `Pre-Alert_${base}.pdf`,
        pallet: `Packing-List-by-Pallet_${base}.pdf`,
        cmr: `CMR_${base}.pdf`,
        poa: `Customs-POA_${base}.pdf`,
        contract: `Sales-Contract_${base}.pdf`,
        bill: `Bill-of-Exchange_${base}.pdf`,
        labels: `Labels_${base}.pdf`,
        all: `Shipping-Documents_${base}.pdf`
      };
      name = names[kind] || `CI-PL_${base}.pdf`;
    }
    saveBlob(blob, name);
    toast(t("dl.ok", { file: name }));
    saveProfile();
  } catch (e) {
    console.error(e);
    toast(t("dl.fail", { msg: e.message || String(e) }), "error", 8000);
  } finally {
    btn.disabled = false;
  }
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* Antete satıcı, banka ve imza bilgisini hatırlat */
async function saveProfile() {
  if (!app.lh) return;
  const s = app.state;
  app.lh.profile = {
    seller: { ...s.seller },
    bank: { ...s.bank },
    sign: { name: s.sign.name, title: s.sign.title, place: s.sign.place, declaration: s.sign.declaration, showDeclaration: s.sign.showDeclaration }
  };
  await store.saveLetterhead(app.lh);
}

/* ========================================================== Antetler */

function bindLetterheadUi() {
  setupDropzone($("#lhDrop"), $("#lhInput"), onLetterheadFile);
  const list = $("#lhList");
  list.addEventListener("click", (e) => {
    const card = e.target.closest(".lh-card");
    if (!card) return;
    const act = e.target.closest("button[data-act]");
    const id = card.dataset.id;
    if (act?.dataset.act === "edit") { e.stopPropagation(); const rec = app.letterheads.find((l) => l.id === id); if (rec) openLhDialog(rec, false); return; }
    if (act?.dataset.act === "del") { e.stopPropagation(); deleteLh(id); return; }
    selectLetterhead(id);
  });
  list.addEventListener("keydown", (e) => {
    const card = e.target.closest(".lh-card");
    if (!card || e.target !== card) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectLetterhead(card.dataset.id); }
  });
}

function renderLhList() {
  const wrap = $("#lhList");
  const cards = [lhCard({ id: "none", name: t("lh.none"), sub: t("lh.noneDesc") })];
  for (const l of app.letterheads) cards.push(lhCard({ id: l.id, name: l.name, sub: (l.sourceType || "").toUpperCase(), thumb: l.thumb, editable: true }));
  wrap.replaceChildren(...cards);
}

function lhCard({ id, name, sub, thumb, editable }) {
  const card = document.createElement("div");
  card.className = "lh-card";
  card.dataset.id = id;
  card.setAttribute("role", "radio");
  card.tabIndex = 0;
  card.setAttribute("aria-checked", String(app.lhId === id));
  const th = document.createElement("div");
  th.className = "lh-thumb" + (thumb ? "" : " lh-thumb--none");
  if (thumb) { const img = document.createElement("img"); img.src = thumb; img.alt = ""; th.append(img); }
  else th.innerHTML = ICONS.blank;
  const info = document.createElement("div");
  info.className = "lh-info";
  const strong = document.createElement("strong");
  strong.textContent = name;
  strong.title = name;
  const span = document.createElement("span");
  span.textContent = sub || "";
  info.append(strong, span);
  const badge = document.createElement("span");
  badge.className = "lh-badge";
  badge.innerHTML = ICONS.check;
  card.append(th, info, badge);
  if (editable) {
    const acts = document.createElement("div");
    acts.className = "lh-actions";
    acts.append(iconBtn(ICONS.sliders, t("lh.edit"), "edit"), iconBtn(ICONS.trash, t("lh.delete"), "del", "icon-btn--danger"));
    card.append(acts);
  }
  return card;
}

async function selectLetterhead(id, { applyProfile = true } = {}) {
  app.lhId = id;
  app.lh = id === "none" ? null : app.letterheads.find((l) => l.id === id) || (await store.getLetterhead(id));
  store.kvSet("lhId", id);
  renderLhList();
  if (applyProfile && app.lh?.profile && applyProfileToState(app.lh.profile)) {
    if (app.started) fillForm();
    toast(t("lh.profileApplied"), "info");
  }
  syncConditional();
  schedulePreview(60);
}

/* Profil yalnızca boş alanları doldurur */
function applyProfileToState(p) {
  let any = false;
  const fill = (section, src) => {
    if (!src) return;
    for (const [k, v] of Object.entries(src)) {
      if (typeof v !== "string" || !v) continue;
      if (!app.state[section][k]) { app.state[section][k] = v; any = true; }
    }
  };
  fill("seller", p.seller);
  fill("bank", p.bank);
  if (p.sign) {
    for (const k of ["name", "title", "place"]) if (p.sign[k] && !app.state.sign[k]) { app.state.sign[k] = p.sign[k]; any = true; }
  }
  return any;
}

async function deleteLh(id) {
  const rec = app.letterheads.find((l) => l.id === id);
  if (!rec || !window.confirm(t("lh.confirmDelete", { name: rec.name }))) return;
  await store.deleteLetterhead(id);
  app.letterheads = app.letterheads.filter((l) => l.id !== id);
  if (app.lhId === id) await selectLetterhead("none", { applyProfile: false });
  else renderLhList();
  toast(t("lh.deleted"));
}

async function onLetterheadFile(file) {
  const zone = $("#lhDrop");
  zone.classList.add("is-busy");
  try {
    const rec = await processLetterheadFile(file);
    openLhDialog(rec, true);
  } catch (e) {
    console.error(e);
    toast(e.key ? t(e.key, e.vars) : t("lh.err.failed", { msg: e.message || String(e) }), "error", 8000);
  } finally {
    zone.classList.remove("is-busy");
  }
}

/* --- Antet ayar penceresi ------------------------------------------------- */

const dlg = { rec: null, isNew: false, url: null };

function bindDialog() {
  const dialog = $("#lhDialog");
  const form = $("#lhdForm");
  form.addEventListener("submit", async (e) => {
    const action = e.submitter?.value;
    if (action !== "save") return; // vazgeç: <form method=dialog> kapatır
    e.preventDefault();
    await saveDialog();
    dialog.close();
  });
  dialog.addEventListener("close", () => {
    if (dlg.url) { URL.revokeObjectURL(dlg.url); dlg.url = null; }
  });
  $$(".lhd-margins input").forEach((inp) => inp.addEventListener("input", () => {
    const v = parseFloat(inp.value);
    if (!Number.isFinite(v) || !dlg.rec) return;
    dlg.rec.margins[inp.dataset.edge] = clampMargin(inp.dataset.edge, v);
    updateArea(false);
  }));
  $$(".lhd-handle").forEach((h) => h.addEventListener("pointerdown", (e) => startDrag(e, h.dataset.edge)));
}

function openLhDialog(rec, isNew) {
  dlg.rec = { ...rec, margins: { ...rec.margins } };
  dlg.isNew = isNew;
  if (dlg.url) URL.revokeObjectURL(dlg.url);
  dlg.url = rec.preview ? URL.createObjectURL(rec.preview) : null;
  $("#lhdImg").src = dlg.url || rec.thumb;
  $("#lhdPage").style.aspectRatio = `${rec.pageWidth} / ${rec.pageHeight}`;
  $("#lhdName").value = rec.name || "";
  $$('input[name="lhdApply"]').forEach((r) => { r.checked = r.value === (rec.applyTo || "all"); });
  $("#lhdAuto").hidden = !isNew;
  const notes = $("#lhdNotes");
  notes.replaceChildren(...(rec.notes || []).map((k) => { const li = document.createElement("li"); li.textContent = t(k); return li; }));
  updateArea(true);
  applyI18n($("#lhDialog"));
  $("#lhDialog").showModal();
}

function pageMm() {
  return { w: dlg.rec.pageWidth / PT_PER_MM, h: dlg.rec.pageHeight / PT_PER_MM };
}

function clampMargin(edge, v) {
  const P = pageMm(), m = dlg.rec.margins;
  if (edge === "top") return Math.round(Math.min(Math.max(v, 5), P.h - m.bottom - 60));
  if (edge === "bottom") return Math.round(Math.min(Math.max(v, 5), P.h - m.top - 60));
  if (edge === "left") return Math.round(Math.min(Math.max(v, 5), P.w - m.right - 80));
  return Math.round(Math.min(Math.max(v, 5), P.w - m.left - 80));
}

function updateArea(syncInputs = true) {
  const m = dlg.rec.margins, P = pageMm();
  const a = $("#lhdArea");
  a.style.top = `${(m.top / P.h) * 100}%`;
  a.style.bottom = `${(m.bottom / P.h) * 100}%`;
  a.style.left = `${(m.left / P.w) * 100}%`;
  a.style.right = `${(m.right / P.w) * 100}%`;
  if (syncInputs) {
    $("#lhdTop").value = m.top; $("#lhdBottom").value = m.bottom;
    $("#lhdLeft").value = m.left; $("#lhdRight").value = m.right;
  }
}

function startDrag(e, edge) {
  e.preventDefault();
  const page = $("#lhdPage");
  const target = e.currentTarget;
  target.setPointerCapture?.(e.pointerId);
  const move = (ev) => {
    const r = page.getBoundingClientRect();
    const P = pageMm();
    let v;
    if (edge === "top") v = ((ev.clientY - r.top) / r.height) * P.h;
    else if (edge === "bottom") v = ((r.bottom - ev.clientY) / r.height) * P.h;
    else if (edge === "left") v = ((ev.clientX - r.left) / r.width) * P.w;
    else v = ((r.right - ev.clientX) / r.width) * P.w;
    dlg.rec.margins[edge] = clampMargin(edge, v);
    updateArea(true);
  };
  const up = () => {
    target.removeEventListener("pointermove", move);
    target.removeEventListener("pointerup", up);
    target.removeEventListener("pointercancel", up);
  };
  target.addEventListener("pointermove", move);
  target.addEventListener("pointerup", up);
  target.addEventListener("pointercancel", up);
}

async function saveDialog() {
  const rec = dlg.rec;
  rec.name = $("#lhdName").value.trim() || rec.fileName || "Antet";
  rec.applyTo = $('input[name="lhdApply"]:checked')?.value || "all";
  const ok = await store.saveLetterhead(rec);
  if (!ok && app.persistent) { app.persistent = false; $("#lhStorageNote").textContent = t("lh.storageFail"); }
  if (dlg.isNew) store.requestPersistence();
  const i = app.letterheads.findIndex((l) => l.id === rec.id);
  if (i >= 0) app.letterheads[i] = rec; else app.letterheads.unshift(rec);
  await selectLetterhead(rec.id);
  toast(ok ? t("lh.saved") : t("lh.storageFail"), ok ? "ok" : "warn", ok ? 3500 : 8000);
}

/* ========================================================== Proforma */

function bindProformaUi() {
  setupDropzone($("#pfDrop"), $("#pfInput"), onProformaFile);
  $("#startBlank").addEventListener("click", () => {
    if (!app.started || !hasAnyContent(app.state)) {
      app.state = freshState();
      app.state.items.push(newItem());
      app.auto = new Set();
    }
    startWorkspace(true);
    setTimeout(() => $("#f_invoiceNo").focus({ preventScroll: true }), 500);
  });
}

async function onProformaFile(file) {
  if (app.started && hasAnyContent(app.state) && app.state.items.some((it) => it.description) && !window.confirm(t("pf.confirmReplace"))) return;
  const zone = $("#pfDrop");
  zone.classList.add("is-busy");
  const result = $("#pfResult");
  result.hidden = false;
  $("#pfFile").textContent = t("pf.reading", { file: file.name });
  $("#pfChips").replaceChildren();
  $("#pfWarnings").replaceChildren();
  try {
    const res = await parseProforma(file);
    applyParsed(res);
    app.lastParse = { name: file.name, res };
    showParseResult(file.name, res);
    startWorkspace(true);
  } catch (e) {
    console.error(e);
    app.lastParse = null;
    $("#pfFile").textContent = file.name;
    const li = document.createElement("li");
    li.className = "lvl-error";
    li.innerHTML = ICONS.error;
    const span = document.createElement("span");
    span.textContent = e.key ? t(e.key, e.vars) : t("warn.failed", { msg: e.message || String(e) });
    li.append(span);
    $("#pfWarnings").replaceChildren(li);
  } finally {
    zone.classList.remove("is-busy");
  }
}

function suggestInvoiceNo(pi) {
  const m = String(pi).match(/^(?:pro-?forma|pfi|pf|p\.?i\.?)[\s\-_/.#:]*(.+)$/i);
  return m ? `CI-${m[1]}` : `CI-${pi}`;
}

function applyParsed(res) {
  const s = freshState(app.state, { keepCompany: false });
  const auto = new Set();
  const dec = uiDec();
  const setA = (path, v) => {
    if (v == null || v === "") return;
    setPath(s, path, v);
    auto.add(path);
  };
  const partyKeys = ["name", "address", "taxId", "contact"];

  setA("meta.proformaNo", res.meta.proformaNo);
  setA("meta.proformaDate", res.meta.proformaDate);
  setA("meta.orderRef", res.meta.orderRef);
  if (res.meta.currency) setA("meta.currency", res.meta.currency);
  if (res.meta.proformaNo) setA("meta.invoiceNo", suggestInvoiceNo(res.meta.proformaNo));

  if (res.seller && !s.seller.name) partyKeys.forEach((k) => setA(`seller.${k}`, res.seller[k]));
  if (res.buyer) partyKeys.forEach((k) => setA(`buyer.${k}`, res.buyer[k]));
  if (res.consignee?.name && res.consignee.name !== res.buyer?.name) {
    s.consignee.same = false;
    partyKeys.forEach((k) => setA(`consignee.${k}`, res.consignee[k]));
  }
  if (res.notify?.name) {
    s.notify.enabled = true;
    partyKeys.forEach((k) => setA(`notify.${k}`, res.notify[k]));
  }
  for (const [k, v] of Object.entries(res.shipment)) setA(`shipment.${k}`, v);
  if (!s.shipment.countryOrigin) {
    const origins = [...new Set(res.items.map((it) => it.origin).filter(Boolean))];
    if (origins.length === 1) setA("shipment.countryOrigin", origins[0].toUpperCase());
  }

  const c = res.charges;
  if (c.freight) setA("charges.freight", toInput(c.freight, dec, 2));
  if (c.insurance) setA("charges.insurance", toInput(c.insurance, dec, 2));
  if (c.discount) setA("charges.discount", toInput(c.discount, dec, 2));
  if (c.vat) setA("charges.vat", toInput(c.vat, dec, 2));
  if (c.vatRate) setA("charges.vatRate", toInput(c.vatRate, dec, 2));
  if (c.other) { setA("charges.other", toInput(c.other, dec, 2)); setA("charges.otherLabel", c.otherLabel); }

  for (const [k, v] of Object.entries(res.bank)) if (v && !s.bank[k]) setA(`bank.${k}`, v);

  const pt = res.packingTotals;
  if (pt.packageType) setA("packing.packageType", pt.packageType);
  const itemsHaveWeights = res.items.some((it) => it.netWeight != null || it.grossWeight != null);
  const itemsHavePkgs = res.items.some((it) => it.packages != null);
  if (!itemsHavePkgs && pt.packages != null) setA("packing.totalPackages", toInput(pt.packages, dec, 0));
  if (!itemsHaveWeights) {
    if (pt.net != null) setA("packing.totalNet", toInput(pt.net, dec, 3));
    if (pt.gross != null) setA("packing.totalGross", toInput(pt.gross, dec, 3));
  }
  if (pt.volume != null && !res.items.some((it) => it.volume != null)) setA("packing.totalVolume", toInput(pt.volume, dec, 3));

  s.items = res.items.map((it) => {
    const item = newItem({
      code: it.code || "",
      description: it.description || "",
      hsCode: it.hsCode || "",
      origin: it.origin && it.origin.toUpperCase() !== (s.shipment.countryOrigin || "").toUpperCase() ? it.origin.toUpperCase() : "",
      qty: toInput(it.qty, dec, 4),
      unit: it.unit || "PCS",
      unitPrice: toInput(it.unitPrice, dec, 6),
      currency: it.currency && it.currency !== res.meta.currency ? it.currency : "",
      vatRate: toInput(it.vatRate, dec, 2),
      amount: toInput(it.amount, dec, 2),
      packages: toInput(it.packages, dec, 0),
      packageType: it.packageType || "",
      netWeight: toInput(it.netWeight, dec, 3),
      grossWeight: toInput(it.grossWeight, dec, 3),
      dimensions: it.dimensions || "",
      volume: toInput(it.volume, dec, 4)
    });
    for (const f of ["code", "description", "hsCode", "origin", "qty", "unit", "unitPrice", "currency", "vatRate", "amount", "packages", "packageType", "netWeight", "grossWeight", "dimensions", "volume"]) {
      if (item[f] !== "" && !(f === "unit" && !it.unit)) auto.add(`item:${item.id}:${f}`);
    }
    return item;
  });
  if (!s.items.length) s.items.push(newItem());

  app.state = s;
  app.auto = auto;
  if (itemsHaveWeights || itemsHavePkgs) app.view = "invoice";
}

function showParseResult(name, res) {
  const file = $("#pfFile");
  file.innerHTML = ICONS.doc;
  const span = document.createElement("span");
  span.textContent = t("pf.readDone", { file: name });
  file.append(span);

  const chips = [];
  const chip = (text, ok) => {
    const el = document.createElement("span");
    el.className = `chip ${ok ? "chip--ok" : "chip--warn"}`;
    el.innerHTML = ok ? ICONS.check : ICONS.warn;
    el.append(document.createTextNode(text));
    chips.push(el);
  };
  chip(t("chip.items", { n: res.items.length }), res.items.length > 0);
  chip(t("chip.seller"), !!res.seller?.name);
  chip(t("chip.buyer"), !!res.buyer?.name);
  if (res.shipment.incoterm) chip(t("chip.incoterm", { v: [res.shipment.incoterm, res.shipment.incotermPlace].filter(Boolean).join(" ") }), true);
  if (res.meta.currency) chip(t("chip.currency", { v: res.meta.currency }), true);
  if (res.items.some((it) => it.hsCode)) chip(t("chip.hs"), true);
  if (res.items.some((it) => it.netWeight != null || it.grossWeight != null) || res.packingTotals.net != null || res.packingTotals.gross != null) chip(t("chip.weights"), true);
  if (res.bank.iban || res.bank.bankName) chip(t("chip.bank"), true);
  $("#pfChips").replaceChildren(...chips);

  const cur = res.meta.currency || "";
  const items = res.warnings.map((w) => {
    const li = document.createElement("li");
    li.className = `lvl-${w.level || "info"}`;
    li.innerHTML = w.level === "ok" ? ICONS.check : w.level === "warn" ? ICONS.warn : ICONS.info;
    const vars = { ...(w.vars || {}) };
    for (const k of w.fmt || []) vars[k] = `${fmtUi(vars[k])} ${cur}`.trim();
    const sp = document.createElement("span");
    sp.textContent = t(w.key, vars);
    li.append(sp);
    return li;
  });
  $("#pfWarnings").replaceChildren(...items);
  $("#pfResult").hidden = false;
}

/* ========================================================== Yardımcı */

function setupDropzone(zone, input, onFile) {
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("is-over"); });
  zone.addEventListener("dragleave", (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove("is-over"); });
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.remove("is-over");
    const f = e.dataTransfer?.files?.[0];
    if (f) onFile(f);
  });
  input.addEventListener("change", () => {
    const f = input.files?.[0];
    if (f) onFile(f);
    input.value = "";
  });
}

// Geliştirme ve otomatik testler için durum erişimi
window.__lgx = { app, round };
