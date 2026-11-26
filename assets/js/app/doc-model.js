/* Belge modeli: durum yapısı, hesaplamalar, biçimleme, yazıyla tutar. */
import { parseNum } from "./parse/normalize.js";
import { getLang } from "../i18n.js";

export const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
export const TRANSPORT_MODES = [
  ["BY SEA", "tm.sea"], ["BY AIR", "tm.air"], ["BY ROAD", "tm.road"],
  ["BY RAIL", "tm.rail"], ["MULTIMODAL", "tm.multi"], ["COURIER", "tm.courier"]
];
export const CURRENCIES = ["USD", "EUR", "GBP", "TRY", "CNY", "RUB", "AED", "SAR", "CHF", "JPY"];
export const UNITS = ["PCS", "SET", "KG", "M", "M2", "M3", "L", "PAIR", "BOX", "CTN", "ROLL", "TON", "PKG", "DOZ", "BAG"];
export const PACKAGE_TYPES = ["CARTONS", "PALLETS", "BOXES", "CRATES", "BAGS", "BALES", "DRUMS", "ROLLS", "BUNDLES", "CASES", "PIECES"];

export const DEFAULT_ORIGIN_STATEMENT = "We, {seller}, hereby declare that the goods described above are of {origin} origin and were wholly obtained or sufficiently processed in that country. All particulars stated in this declaration are true and correct.";

export const DEFAULT_ORIGIN_STATEMENT_MIXED = "We, {seller}, hereby declare that each of the goods described above is of the origin stated against it in the table and was wholly obtained or sufficiently processed in that country. All particulars stated in this declaration are true and correct.";

export const DEFAULT_POA_SCOPE = [
  "1. To lodge, sign and amend customs declarations and related documents for the goods described below.",
  "2. To submit commercial invoices, packing lists, certificates of origin, transport documents and any other supporting documents.",
  "3. To pay customs duties, taxes and charges on behalf of the Principal and to receive refunds where applicable.",
  "4. To take delivery of the goods, arrange examination and release, and handle storage and transport formalities.",
  "5. To appoint substitutes or sub-agents where necessary and to take all other actions required to complete customs clearance."
].join("\n");

export const DEFAULT_PROFORMA_DECLARATION = "This is a proforma invoice and not a demand for payment.";
export const DEFAULT_DECLARATION = "We hereby certify that this invoice shows the actual price of the goods described, that all particulars are true and correct, and that the goods are of the origin stated above.";

let seq = 0;
export const uid = () => `i${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Palet: başlık bilgileri + kalemlere bağlı içerik satırları (lines). contents: serbest not (eski kayıtlarda eski içerik metni). */
export function newPallet(p = {}) {
  return { id: uid(), no: "", type: "PALLET", contents: "", dimensions: "", net: "", gross: "", lines: [], ...p };
}

/** Palet içerik satırı: bir kalemden kaç kap (cartons) ve/veya ne kadar miktar (qty); sayılar metin olarak tutulur */
export function newPalletLine(p = {}) {
  return { id: uid(), itemId: "", cartons: "", qty: "", ...p };
}

/** "120x80x150" → m³ (cm ölçülerden); okunamazsa null */
export function palletVolume(p) {
  const m = String(p.dimensions || "").match(/(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return null;
  const [a, b, c] = [m[1], m[2], m[3]].map((v) => parseFloat(v.replace(",", ".")));
  return round((a * b * c) / 1e6, 3);
}

/** Kalemlerden palet satırları üretir: kalemin kap sayısı kadar palet; miktar ve ağırlık eşit bölünür. Kaç palet üretildi döner. */
export function palletsFromItems(s) {
  const dec = uiDec();
  const out = [];
  let n = 0;
  for (const it of s.items) {
    const pk = num(it.packages);
    const count = pk && pk >= 1 ? Math.round(pk) : 1;
    const q = num(it.qty), net = num(it.netWeight), gross = num(it.grossWeight);
    const split = (total, dp) => {
      if (total == null) return Array(count).fill(null);
      const each = round(total / count, dp);
      const arr = Array(count).fill(each);
      arr[count - 1] = round(total - each * (count - 1), dp);
      return arr;
    };
    const qs = split(q, q != null && Number.isInteger(q) ? 0 : 3), ns = split(net, 2), gs = split(gross, 2);
    const type = (it.packageType || s.packing.packageType || "PALLET").replace(/S$/, "");
    for (let i = 0; i < count; i++) {
      n++;
      const qty = qs[i] != null ? ` — ${fmtQty(qs[i])} ${(it.unit || "").toUpperCase()}`.trimEnd() : "";
      out.push(newPallet({
        no: String(n), type,
        contents: `${(it.description || "").trim().replace(/\s*\n\s*/g, " ")}${qty}`,
        net: toInput(ns[i], dec, 2), gross: toInput(gs[i], dec, 2)
      }));
    }
  }
  s.pallets = out;
  return out.length;
}

export function newItem(p = {}) {
  return {
    id: uid(), code: "", description: "", hsCode: "", origin: "", qty: "", unit: "PCS", unitPrice: "", currency: "", vatRate: "", amount: "",
    packages: "", packageType: "", netWeight: "", grossWeight: "", dimensions: "", volume: "", ...p
  };
}

const party = () => ({ name: "", address: "", taxId: "", person: "", contact: "" }); // person: karşıda irtibat kurulacak kişi (ad soyad)

export function createEmptyState() {
  return {
    version: 1,
    meta: { invoiceNo: "", invoiceDate: todayIso(), plNo: "", proformaNo: "", proformaDate: "", orderRef: "", currency: "USD" },
    seller: party(),
    buyer: party(),
    consignee: { same: true, ...party() },
    notify: { enabled: false, ...party() },
    shipment: { incoterm: "", incotermPlace: "", paymentTerms: "", transportMode: "", portLoading: "", portDischarge: "", finalDestination: "", countryOrigin: "", countryDestination: "", vessel: "", containerNo: "", shipmentDate: "" },
    ship: { siNo: "", blNo: "", bookingNo: "", carrier: "", forwarder: "", placeReceipt: "", placeDelivery: "", freightTerms: "", blType: "", originals: "3", goodsDescription: "", instructions: "" },
    instr: { toLoading: "", toCoo: "", toEur1: "", loadingPlace: "", loadingDate: "", vehicle: "", driver: "", loadContact: "", loadNotes: "", copies: "1", eur1Criterion: "", eur1Agreement: "", certNotes: "" },
    pallets: [],
    cmr: { carrier: "", plate: "", docs: "Commercial invoice, Packing list", packing: "", instructions: "", payment: "paid", cod: "", reservations: "", special: "", takingPlace: "", takingDate: "", deliveryPlace: "" },
    poa: { attorney: "", grantor: "seller", country: "", validFrom: "", validUntil: "", scope: DEFAULT_POA_SCOPE, notes: "" },
    contract: { no: "", place: "", delivery: "Delivery shall be made within 30 days after receipt of the advance payment. Partial shipments are allowed.", warranty: "The Seller warrants that the Goods conform to the agreed specifications and are free from defects in material and workmanship for 12 months from the date of shipment.", claims: "The Buyer shall inspect the Goods upon receipt. Claims regarding quantity or visible defects must be notified in writing within 14 days, and claims regarding quality within 30 days of receipt of the Goods, with supporting evidence.", documents: "commercial invoice, packing list, transport document (bill of lading or CMR) and certificate of origin where required.", law: "This Contract shall be governed by the laws of the Republic of Türkiye.", disputes: "The parties shall first try to settle any dispute amicably. Failing that, the dispute shall be submitted to the competent courts of Istanbul.", lateInterest: "", forceMajeure: true, extra: "" },
    bill: { kind: "draft", no: "", tenor: "sight", days: "30", dueDate: "", amount: "", payTo: "", drawnUnder: "", place: "", aval: "", set: "first" },
    labels: { format: "a6x4", source: "packages", count: "", banner: "", showSeller: true },
    ins: { to: "", coverage: "ICC (A) - ALL RISKS", extraPct: "10", insuredParty: "seller", claimsPayableAt: "", notes: "" },
    trans: { to: "", loadAddress: "", loadDate: "", unloadAddress: "", deliveryDate: "", vehicleType: "", freight: "", paymentTerms: "", notes: "" },
    preAlert: { to: "", eta: "", docsExtra: "", notes: "" },
    origin: { certNo: "", statement: DEFAULT_ORIGIN_STATEMENT },
    proforma: { notes: "", declaration: DEFAULT_PROFORMA_DECLARATION },
    foc: { enabled: false, reason: "SAMPLE", reasonOther: "", note: "" },
    items: [],
    charges: { freight: "", insurance: "", otherLabel: "", other: "", discount: "", vatRate: "", vat: "" },
    packing: { packageType: "CARTONS", marks: "", totalPackages: "", totalNet: "", totalGross: "", totalVolume: "" },
    bank: { show: true, bankName: "", branch: "", accountName: "", iban: "", swift: "", accountNo: "" },
    sign: { name: "", title: "", place: "", declaration: DEFAULT_DECLARATION, showDeclaration: true },
    options: { amountInWords: true, showWeightsOnInvoice: true, showHsOnPl: true, paper: "A4" }
  };
}

/* --- Sayılar (arayüz diline göre ondalık) --------------------------------------------- */

export const uiDec = () => (getLang() === "tr" ? "," : ".");

/** Kullanıcı girdisini sayıya çevirir (TR: virgül ondalık, EN: nokta ondalık). */
export function num(v, dec = uiDec()) {
  if (v === "" || v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  return parseNum(v, dec);
}

/** Sayıyı form alanı için metne çevirir (binlik ayırıcı yok). */
export function toInput(n, dec = uiDec(), maxDec = 6) {
  if (n == null || !Number.isFinite(n)) return "";
  let s = String(round(n, maxDec));
  if (s.includes("e")) s = n.toFixed(maxDec).replace(/\.?0+$/, "");
  return dec === "," ? s.replace(".", ",") : s;
}

export function round(v, d = 2) {
  const p = 10 ** d;
  return Math.round((v + Number.EPSILON) * p) / p;
}

/** Dil değişince formdaki sayısal metinleri yeni ondalık biçimine çevirir. */
export function relocalize(state, fromLang, toLang) {
  const from = fromLang === "tr" ? "," : ".", to = toLang === "tr" ? "," : ".";
  if (from === to) return;
  const conv = (s) => { const n = num(s, from); return n == null ? s : toInput(n, to); };
  for (const it of state.items) for (const k of ["qty", "unitPrice", "vatRate", "amount", "packages", "netWeight", "grossWeight", "volume"]) if (it[k] !== "") it[k] = conv(it[k]);
  for (const k of ["freight", "insurance", "other", "discount", "vatRate", "vat"]) if (state.charges[k] !== "") state.charges[k] = conv(state.charges[k]);
  for (const k of ["totalPackages", "totalNet", "totalGross", "totalVolume"]) if (state.packing[k] !== "") state.packing[k] = conv(state.packing[k]);
  for (const p of state.pallets || []) {
    for (const k of ["net", "gross"]) if (p[k] !== "") p[k] = conv(p[k]);
    for (const l of p.lines || []) for (const k of ["cartons", "qty"]) if (l[k] !== "") l[k] = conv(l[k]);
  }
  if (state.trans && state.trans.freight !== "") state.trans.freight = conv(state.trans.freight);
  if (state.ins && state.ins.extraPct !== "") state.ins.extraPct = conv(state.ins.extraPct);
  if (state.cmr && state.cmr.cod !== "") state.cmr.cod = conv(state.cmr.cod);
  if (state.bill && state.bill.amount !== "") state.bill.amount = conv(state.bill.amount);
}

/* --- Hesaplar -------------------------------------------------------------------------- */

export function lineAmount(it) {
  const q = num(it.qty), p = num(it.unitPrice);
  if (q != null && p != null) return round(q * p, 2);
  return num(it.amount);
}

/** Kalemin para birimi: boşsa belge para birimi */
export function itemCurrency(it, s) {
  return String(it.currency || s.meta.currency || "").trim().toUpperCase();
}

/** Kalemin KDV oranı (%): boşsa belge düzeyindeki oran */
export function itemVatRate(it, s) {
  const r = num(it.vatRate);
  return r != null ? r : num(s.charges.vatRate) || 0;
}

/** Kalemin menşe ülkesi: boşsa belgedeki varsayılan */
export function itemOrigin(it, s) {
  return String(it.origin || s.shipment.countryOrigin || "").trim().toUpperCase();
}

/** Belgedeki tüm menşeler (benzersiz, sıralı) */
export function originList(s) {
  const set = new Set(s.items.map((it) => itemOrigin(it, s)).filter(Boolean));
  if (!set.size && s.shipment.countryOrigin.trim()) set.add(s.shipment.countryOrigin.trim().toUpperCase());
  return [...set];
}

export function isAmountComputed(it) {
  return num(it.qty) != null && num(it.unitPrice) != null;
}

export function computeTotals(s) {
  const lines = s.items.map((it) => lineAmount(it) || 0);
  const subtotal = round(lines.reduce((a, b) => a + b, 0), 2);
  const freight = num(s.charges.freight) || 0;
  const insurance = num(s.charges.insurance) || 0;
  const other = num(s.charges.other) || 0;
  const discount = Math.abs(num(s.charges.discount) || 0);
  // KDV: tutar yazılmışsa o, yoksa kalem oranlarından (indirim oranında küçültülerek)
  const vatInput = num(s.charges.vat);
  const vatBase = s.items.reduce((a, it) => a + (lineAmount(it) || 0) * itemVatRate(it, s) / 100, 0);
  const vatScale = discount && subtotal ? Math.max(0, subtotal - discount) / subtotal : 1;
  const vatCalc = round(vatBase * vatScale, 2);
  const vat = vatInput != null ? vatInput : vatCalc;
  const rateSet = new Set(s.items.map((it) => itemVatRate(it, s)));
  // Tutar elle yazıldıysa oran etiketi gösterilmez (tutar orandan bağımsız)
  const vatRate = vatInput != null ? null : rateSet.size === 1 ? [...rateSet][0] : s.items.length ? null : num(s.charges.vatRate) || 0;
  const curSet = new Set(s.items.map((it) => itemCurrency(it, s)).filter(Boolean));
  const mixedCurrency = curSet.size > 1;
  const anyItemCurrency = s.items.some((it) => it.currency && itemCurrency(it, s) !== itemCurrency({}, s));
  const anyVatRate = s.items.some((it) => itemVatRate(it, s) > 0);
  const total = round(subtotal + freight + insurance + other - discount + vat, 2);

  const sum = (k) => s.items.reduce((a, it) => a + (num(it[k]) || 0), 0);
  const itemPkgs = sum("packages"), itemNet = sum("netWeight"), itemGross = sum("grossWeight"), itemVol = sum("volume");
  const ov = (k, fallback) => { const v = num(s.packing[k]); return v != null ? v : fallback; };
  const packages = ov("totalPackages", itemPkgs);
  const net = ov("totalNet", itemNet);
  const gross = ov("totalGross", itemGross);
  const volume = ov("totalVolume", itemVol);

  // Birimler aynıysa toplam miktar
  const units = new Set(s.items.filter((it) => num(it.qty) != null).map((it) => (it.unit || "").toUpperCase()));
  const qtyTotal = units.size === 1 ? round(sum("qty"), 3) : null;

  return {
    lines, subtotal, freight, insurance, other, discount, vat, vatCalc, vatRate, mixedCurrency, anyItemCurrency, anyVatRate, total,
    packages, net, gross, volume, qtyTotal, qtyUnit: units.size === 1 ? [...units][0] : "",
    itemPkgs, itemNet, itemGross, itemVol,
    hasCharges: freight || insurance || other || discount || vat
  };
}

/** Toplam kap/ağırlık/hacmi kalemlere oranlar. basis: 'qty' | 'amount' */
export function distribute(s, basis = "qty") {
  const dec = uiDec();
  const weights = s.items.map((it) => (basis === "amount" ? lineAmount(it) : num(it.qty)) || 0);
  const totalW = weights.reduce((a, b) => a + b, 0);
  if (!totalW) return 0;
  const tp = num(s.packing.totalPackages), tn = num(s.packing.totalNet), tg = num(s.packing.totalGross), tv = num(s.packing.totalVolume);
  if (tp == null && tn == null && tg == null && tv == null) return -1;
  const share = (total, dp) => {
    const raw = weights.map((w) => (total * w) / totalW);
    const r = raw.map((v) => round(v, dp));
    const diff = round(total - r.reduce((a, b) => a + b, 0), dp);
    if (diff) { const i = weights.indexOf(Math.max(...weights)); r[i] = round(r[i] + diff, dp); }
    return r;
  };
  if (tp != null) {
    // Tam sayı dağıtımı (en büyük kalan yöntemi)
    const raw = weights.map((w) => (tp * w) / totalW);
    const fl = raw.map(Math.floor);
    let left = Math.round(tp) - fl.reduce((a, b) => a + b, 0);
    raw.map((v, i) => [v - fl[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { fl[i]++; left--; } });
    s.items.forEach((it, i) => { it.packages = toInput(fl[i], dec); });
  }
  if (tn != null) share(tn, 2).forEach((v, i) => { s.items[i].netWeight = toInput(v, dec); });
  if (tg != null) share(tg, 2).forEach((v, i) => { s.items[i].grossWeight = toInput(v, dec); });
  if (tv != null) share(tv, 3).forEach((v, i) => { s.items[i].volume = toInput(v, dec); });
  return s.items.length;
}

/* --- Belge biçimleri (her zaman İngilizce) ------------------------------------------------- */

const enMoney = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const enQty = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const enW = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const enV = new Intl.NumberFormat("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const enP = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export const fmtMoney = (n) => (n == null ? "" : enMoney.format(n));
export const fmtPrice = (n) => (n == null ? "" : enP.format(n));
export const fmtQty = (n) => (n == null ? "" : enQty.format(n));
export const fmtWeight = (n) => (n == null ? "" : enW.format(n));
export const fmtVolume = (n) => (n == null ? "" : enV.format(n));

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDate(iso) {
  if (!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(iso);
  return `${m[3]} ${MONTHS_EN[+m[2] - 1]} ${m[1]}`;
}

/* Arayüzde gösterim (kullanıcının dili) */
export function fmtUi(n, d = 2) {
  if (n == null) return "–";
  return new Intl.NumberFormat(getLang() === "tr" ? "tr-TR" : "en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
}

/* --- Yazıyla tutar ----------------------------------------------------------------------- */

const ONES = ["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];
const SCALES = ["", "THOUSAND", "MILLION", "BILLION", "TRILLION"];

function under1000(n) {
  const out = [];
  if (n >= 100) { out.push(`${ONES[Math.floor(n / 100)]} HUNDRED`); n %= 100; }
  if (n > 0) out.push(n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ""));
  return out.join(" ");
}

export function intToWords(n) {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "ZERO";
  const parts = [];
  let i = 0;
  while (n > 0 && i < SCALES.length) {
    const chunk = n % 1000;
    if (chunk) parts.unshift(under1000(chunk) + (SCALES[i] ? ` ${SCALES[i]}` : ""));
    n = Math.floor(n / 1000);
    i++;
  }
  return parts.join(" ");
}

const CUR_WORDS = {
  USD: ["US DOLLARS", "CENTS"], EUR: ["EUROS", "CENTS"], GBP: ["POUNDS STERLING", "PENCE"],
  TRY: ["TURKISH LIRAS", "KURUS"], CNY: ["CHINESE YUAN", "FEN"], RUB: ["RUSSIAN ROUBLES", "KOPECKS"],
  AED: ["UAE DIRHAMS", "FILS"], SAR: ["SAUDI RIYALS", "HALALAS"], CHF: ["SWISS FRANCS", "CENTIMES"], JPY: ["JAPANESE YEN", null]
};

export function amountInWords(amount, currency) {
  const cents = Math.round(Math.abs(amount) * 100);
  const major = Math.floor(cents / 100), minor = cents % 100;
  const min = (CUR_WORDS[currency] || [null, "CENTS"])[1];
  let s = `SAY: ONLY ${intToWords(major)}`.replace(/\s+/g, " ");
  if (minor && min) s += ` AND ${min} ${intToWords(minor)}`;
  return `${s}${currency ? " " + currency : ""}`;
}

/** Kalemin geçerli ambalaj türü: kendi değeri; boşsa genel "Ambalaj türü" (kopyalanmaz, her çıktıda okunur) */
export function itemPackageType(it, s) {
  return String(it.packageType || "").trim() || String(s.packing.packageType || "").trim();
}

/** Toplam koli ve türleri: [{ type, count }]. Kalemler tek türdeyse o tür, birden çok türdeyse her biri ayrı; kalemlerden gelmeyen
 *  (elle yazılmış) toplamda ya da koli sayısı yoksa genel tür kullanılır. */
export function packageParts(s, T) {
  const fallback = String(s.packing.packageType || "").trim() || "PACKAGES";
  const total = T.packages;
  if (total == null || !(total > 0)) return [];
  const by = new Map();
  for (const it of s.items) {
    const n = num(it.packages);
    if (n > 0) { const t = itemPackageType(it, s).toUpperCase() || fallback.toUpperCase(); by.set(t, (by.get(t) || 0) + n); }
  }
  const sum = [...by.values()].reduce((a, b) => a + b, 0);
  if (by.size && Math.abs(sum - total) < 1e-9) return [...by].map(([type, count]) => ({ type, count }));
  return [{ type: fallback, count: total }];
}

/** "12 CARTONS + 3 PALLETS" ya da words ile "TWELVE (12) CARTONS + THREE (3) PALLETS"; yazıyla yazılamıyorsa (tam sayı değil) "" */
export function packagesText(s, T, { words = false } = {}) {
  const parts = packageParts(s, T);
  if (!parts.length) return "";
  const out = parts.map((p) => (words ? packagesInWords(p.count, p.type) : `${fmtQty(p.count)} ${p.type}`));
  return out.some((x) => !x) ? "" : out.join(" + ");
}

/** Özet satırındaki tür sütunu: tek tür varsa o, karışıksa "CARTONS / PALLETS" */
export function packageTypeLabel(s, T) {
  const parts = packageParts(s, T);
  return parts.length ? parts.map((p) => p.type).join(" / ") : String(s.packing.packageType || "").trim();
}

export function packagesInWords(n, type) {
  if (n == null || !Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return "";
  return `${intToWords(n)} (${n}) ${type || "PACKAGES"}`.trim();
}

/* --- Eksik alan kontrolü ------------------------------------------------------------- */

export function missingFields(s) {
  const miss = [];
  if (!s.meta.invoiceNo.trim()) miss.push("miss.invoiceNo");
  if (!s.seller.name.trim()) miss.push("miss.seller");
  if (!s.buyer.name.trim()) miss.push("miss.buyer");
  if (!s.items.length) miss.push("miss.items");
  if (!s.meta.currency.trim()) miss.push("miss.currency");
  return miss;
}

/** Proforma için eksik alanlar (fatura no yerine proforma no aranır) */
export function missingProforma(s) {
  const miss = [];
  if (!s.meta.proformaNo.trim()) miss.push("miss.proformaNo");
  if (!s.seller.name.trim()) miss.push("miss.seller");
  if (!s.buyer.name.trim()) miss.push("miss.buyer");
  if (!s.items.length) miss.push("miss.items");
  if (!s.meta.currency.trim()) miss.push("miss.currency");
  return miss;
}

export function hasAnyContent(s) {
  return s.items.length > 0 || !!(s.seller.name || s.buyer.name || s.meta.invoiceNo);
}

export function safeFileName(s) {
  return String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}
