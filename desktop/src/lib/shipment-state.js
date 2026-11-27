/* Sevkiyat kaydının durumu: yeni belge, proforma aktarımı, özet, belge hazırlık durumu. */
import { createEmptyState, newItem, toInput, uiDec, missingFields, computeTotals, uid } from "@engine/doc-model.js";
import { checkDoc } from "../requirements/model.mjs";
import { normalizePallets, palletStatus } from "@engine/pallets.js";

export const STATUSES = ["draft", "ready", "transit", "delivered"];

/** Belge seçici grupları (eski sayfadaki gruplarla aynı) */
export const DOC_GROUPS = [
  { key: "commercial", titleKey: "d.grp.commercial", docs: ["ci", "foc", "pl", "pallet", "contract", "bill"] },
  { key: "shipment", titleKey: "d.grp.shipment", docs: ["si", "bl", "prealert", "cmr", "labels"] },
  { key: "instructions", titleKey: "d.grp.instructions", docs: ["loading", "trans", "ins"] },
  { key: "origin", titleKey: "d.grp.origin", docs: ["origin", "coo", "eur1", "poa"] }
];
export const ALL_DOCS = DOC_GROUPS.flatMap((g) => g.docs);

/** Her belgenin forma ait bölümleri (form-schema.json harfleri) */
export const DOC_SECTIONS = {
  ci: ["A", "B", "C", "D", "E", "F", "G", "H"], foc: ["A", "B", "C", "D", "F", "H"], pl: ["A", "F"], pallet: ["O"], contract: ["R"], bill: ["S"],
  si: ["A", "B", "C", "F", "I"], bl: ["A", "B", "C", "F", "I"], prealert: ["N"], cmr: ["P"], labels: ["T"],
  loading: ["K"], trans: ["M"], ins: ["L"],
  origin: ["J"], coo: ["K"], eur1: ["K"], poa: ["Q"]
};

/** Bir bölümün yalnızca belirtilen alanlarını gösteren belgeler: { belge: { bölüm harfi: [alan yolları ya da alt başlık anahtarları] } }.
 *  Fatura sayfasında teslim şartı ve toplamlar var; limanlar, gemi vb. faturada basılmadığı için yok. */
const list = (s) => s.split(" "); // boşlukla ayrılmış: çeviri denetimi tırnaklı çiftleri anahtar sanıyor
const TRANSPORT_ONLY = {
  A: list("meta.invoiceNo meta.invoiceDate meta.orderRef"),
  C: list("shipment.transportMode shipment.portLoading shipment.portDischarge shipment.finalDestination shipment.vessel shipment.containerNo shipment.shipmentDate shipment.incoterm shipment.incotermPlace"),
  F: list("packing.packageType packing.marks f.totalsTitle packing.totalPackages packing.totalNet packing.totalGross packing.totalVolume")
};
const SHIP_COMMON = "ship.bookingNo ship.carrier ship.placeReceipt ship.placeDelivery ship.freightTerms ship.originals ship.blType ship.goodsDescription";
export const DOC_ONLY = {
  si: { ...TRANSPORT_ONLY, I: list(`ship.siNo ship.forwarder ${SHIP_COMMON} ship.instructions`) },
  bl: { ...TRANSPORT_ONLY, I: list(`ship.blNo ${SHIP_COMMON}`) },
  foc: {
    A: list("meta.invoiceNo meta.invoiceDate meta.orderRef meta.currency"),
    C: list("shipment.incoterm shipment.incotermPlace"),
    F: list("f.totalsTitle packing.totalPackages packing.totalNet packing.totalGross packing.totalVolume options.showWeightsOnInvoice"),
    H: list("sign.name sign.title sign.place")
  },
  ci: {
    C: list("shipment.incoterm shipment.incotermPlace"),
    F: list("f.totalsTitle packing.totalPackages packing.totalNet packing.totalGross packing.totalVolume options.showWeightsOnInvoice")
  }
};

/** Ortak bir bölümün başlığını belgeye göre değiştirir: { belge: { bölüm harfi: başlık çeviri anahtarı } } */
export const DOC_TITLE = { si: { I: "pv.si" }, bl: { I: "pv.bl" } };

/** Belgeye bağlı olmayan, ortak bilgi adımları */
export const STEPS = {
  general: ["A", "B", "C"],
  items: ["D", "E", "F"],
  bank: ["G", "H"]
};

/** Belgenin durum alanı (kayıttaki bölüm adı); yoksa özel kurala bağlı */
const STATE_KEY = { si: "ship", bl: "ship", origin: "origin", loading: "instr", coo: "instr", eur1: "instr", ins: "ins", trans: "trans", prealert: "preAlert", cmr: "cmr", poa: "poa", contract: "contract", bill: "bill" };

export const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
export function setPath(o, p, v) {
  const ks = p.split(".");
  let cur = o;
  for (let i = 0; i < ks.length - 1; i++) cur = cur[ks[i]];
  cur[ks[ks.length - 1]] = v;
}

/* Yeni belge. Satıcı/banka/imza: önce antet profili; keepCompany ise önceki sevkiyatın bilgisi.
   Proformadan başlarken keepCompany=false: önceki firma yeni belgeye taşınmaz. */
export function freshState({ prev = null, profile = null, keepCompany = true } = {}) {
  const s = createEmptyState();
  const has = (o) => !!o && Object.entries(o).some(([k, v]) => k !== "show" && typeof v === "string" && v.trim());
  const seller = has(profile?.seller) ? profile.seller : keepCompany && has(prev?.seller) ? prev.seller : null;
  if (seller) s.seller = { ...s.seller, ...seller };
  const bank = has(profile?.bank) ? profile.bank : keepCompany && has(prev?.bank) ? prev.bank : null;
  if (bank) s.bank = { ...s.bank, ...bank };
  const sign = profile?.sign || prev?.sign;
  if (sign) s.sign = { ...s.sign, name: sign.name || "", title: sign.title || "", place: sign.place || "", declaration: sign.declaration || s.sign.declaration, showDeclaration: sign.showDeclaration ?? true };
  if (prev?.options) s.options = { ...s.options, ...prev.options };
  if (prev?.packing?.packageType) s.packing.packageType = prev.packing.packageType;
  return s;
}

/** Antet profili yalnızca boş alanları doldurur. Değişiklik olduysa true. */
export function applyProfileToState(state, p) {
  let any = false;
  const fill = (section, src) => {
    if (!src) return;
    for (const [k, v] of Object.entries(src)) {
      if (typeof v !== "string" || !v) continue;
      if (!state[section][k]) { state[section][k] = v; any = true; }
    }
  };
  fill("seller", p.seller);
  fill("bank", p.bank);
  if (p.sign) for (const k of ["name", "title", "place"]) if (p.sign[k] && !state.sign[k]) { state.sign[k] = p.sign[k]; any = true; }
  return any;
}

/** Kayıtlı durumu güncel şemaya uydurur (yeni alanlar eklendiyse varsayılanla tamamlanır) */
export function migrate(saved) {
  const base = createEmptyState();
  for (const k of Object.keys(base)) {
    if (saved[k] == null) continue;
    if (Array.isArray(base[k])) base[k] = saved[k];
    else if (typeof base[k] === "object") base[k] = { ...base[k], ...saved[k] };
    else base[k] = saved[k];
  }
  base.items = base.items.map((it) => ({ ...newItem(), ...it }));
  base.pallets = normalizePallets(base.pallets); // eski biçim (yalnız içerik metni) ve yedekten gelen bozuk satırlar
  return base;
}

export function suggestInvoiceNo(pi) {
  const m = String(pi).match(/^(?:pro-?forma|pfi|pf|p\.?i\.?)[\s\-_/.#:]*(.+)$/i);
  return m ? `CI-${m[1]}` : `CI-${pi}`;
}

/** Proforma okuma sonucunu yeni bir belge durumuna çevirir. { state, auto:Set } döner. */
export function applyParsed(res, { prev = null, profile = null } = {}) {
  const s = freshState({ prev, profile, keepCompany: false });
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
  return { state: s, auto };
}

/** Listede ve panoda gösterilen kısa özet (kayıtla birlikte saklanır) */
export function summarize(state) {
  const T = computeTotals(state);
  return {
    invoiceNo: state.meta.invoiceNo.trim(),
    proformaNo: state.meta.proformaNo.trim(),
    buyer: state.buyer.name.trim(),
    seller: state.seller.name.trim(),
    currency: (state.meta.currency || "").toUpperCase(),
    total: T.total,
    items: state.items.filter((it) => it.description || it.qty).length,
    incoterm: [state.shipment.incoterm, state.shipment.incotermPlace].filter(Boolean).join(" "),
    from: state.shipment.portLoading.trim(),
    to: (state.shipment.portDischarge || state.shipment.finalDestination).trim(),
    mode: state.shipment.transportMode,
    shipDate: state.shipment.shipmentDate,
    foc: !!state.foc?.enabled,
    missing: missingFields(state)
  };
}

/** Belgenin hazırlık durumu: 'ready' | 'partial' | 'empty' */
export function docStatus(state, doc) {
  const hasItems = state.items.some((it) => it.description || it.qty);
  if (doc === "ci" || doc === "foc" || doc === "pl") {
    if (!hasItems && !state.buyer.name && !state.seller.name) return "empty";
    return missingFields(state).length || checkDoc(state, doc).length ? "partial" : "ready";
  }
  if (doc === "pallet") { const st = palletStatus(state); return st === "ready" && checkDoc(state, "pallet").length ? "partial" : st; }
  if (doc === "labels") return hasItems || state.pallets.length ? "ready" : "empty";
  const key = STATE_KEY[doc];
  if (!key) return "empty";
  return JSON.stringify(state[key]) !== JSON.stringify(createEmptyState()[key]) ? "ready" : "empty";
}

export function newShipmentRecord({ state, auto = new Set(), lhId = null, parse = null, companyId = null, proformaId = null }) {
  const now = Date.now();
  return { id: uid(), status: "draft", lhId, companyId, bankId: null, bankAuto: true, proformaId, createdAt: now, updatedAt: now, state, auto: [...auto], parse, summary: summarize(state) };
}

export const shipmentTitle = (rec) => rec.summary?.invoiceNo || rec.summary?.proformaNo || "";

/** Sevkiyatı kopyalar: fatura ve packing list numaraları boşaltılır, tarih bugüne alınır */
export function duplicateRecord(rec) {
  const state = structuredClone(rec.state);
  state.meta.invoiceNo = "";
  state.meta.plNo = "";
  state.meta.invoiceDate = createEmptyState().meta.invoiceDate;
  const now = Date.now();
  return { ...rec, id: uid(), status: "draft", proformaId: null, createdAt: now, updatedAt: now, state, auto: [], parse: null, summary: summarize(state) };
}
