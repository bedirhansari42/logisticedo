/* Proforma analizi: satır/hücre yapısından belge alanlarını ve kalem tablosunu çıkarır.
   Girdi satırları extract-*.js modüllerinden gelir (PDF, Excel, Word aynı yapıya çevrilir). */
import {
  norm, fold, parseNum, looksNumeric, detectDecimalSep, parseDate, findIncoterm, detectCurrency,
  normUnit, unitFromQtyText, pkgTypeFromText, cleanHs, hsFromText, transportFromText, numberTokens
} from "./normalize.js";

/* Tek satırlık özetlerden (ör. "N.W.: 3,120.00 KGS  G.W.: 3,560.00 KGS  Packages: 245 CARTONS") değer çekme */
const NUM = "(\\d[\\d.,']*\\d|\\d)";
const SUMMARY_RULES = [
  ["net", new RegExp(`(?:net\\s*(?:weight|wt|w)\\.?|n\\.\\s?w\\.?|net\\s*a[gğ][ıi]rl[ıi][kğ]\\p{L}*|nettogewicht)\\s*(?:\\(?\\s*kgs?\\.?\\s*\\)?)?\\s*[:=]?\\s*${NUM}`, "iu")],
  ["gross", new RegExp(`(?:gross\\s*(?:weight|wt|w)\\.?|g\\.\\s?w\\.?|br[uü]t\\s*a[gğ][ıi]rl[ıi][kğ]\\p{L}*|bruttogewicht|poids\\s*brut)\\s*(?:\\(?\\s*kgs?\\.?\\s*\\)?)?\\s*[:=]?\\s*${NUM}`, "iu")],
  ["volume", new RegExp(`(?:volume|hacim|measurement|cbm|m3|m³)\\s*(?:\\(?\\s*(?:cbm|m3|m³)\\s*\\)?)?\\s*[:=]\\s*${NUM}|(?:volume|hacim)\\s+${NUM}|${NUM}\\s*(?:cbm|m3|m³)(?![\\p{L}])`, "iu")],
  ["packages", new RegExp(`(?:total\\s*)?(?:packages|pkgs|no\\.?\\s*of\\s*(?:packages|cartons|pkgs|ctns)|koli\\s*(?:adedi|say[ıi]s[ıi])|kap\\s*(?:adedi|say[ıi]s[ıi])|palet\\s*(?:adedi|say[ıi]s[ıi])|cartons|ctns)\\s*[:=]\\s*${NUM}|${NUM}\\s*(?:cartons?|ctns?|pallets?|boxes|cases|bags|koli|palet|packages|pkgs)(?![\\p{L}])`, "iu")]
];
const firstGroup = (m) => (m ? m.slice(1).find((g) => g != null) : null);

const B = "(?<![\\p{L}\\p{N}])";
const E = "(?![\\p{L}\\p{N}])";
const rx = (alts, flags = "u") => new RegExp(`${B}(?:${alts.join("|")})${E}`, flags);
const rxFull = (alts) => new RegExp(`^(?:${alts.join("|")})(?:\\s*\\([^)]*\\))?$`, "u");

/* ------------------------------------------------------------------ Sütun başlıkları */

const COL_RULES = [
  ["vatRate", /(?<![\p{L}\p{N}])(?:vat|kdv|mwst|tva|iva|ндс)\s*(?:%|\(\s*%\s*\)|rate|oran\p{L}*|percent\p{L}*)|%\s*(?:vat|kdv)(?![\p{L}])/u],
  ["skip", rx(["discount", "disc\\.?", "iskonto", "indirim", "rabatt", "remise", "descuento", "vat", "kdv", "mwst", "tva", "iva", "ндс"])],
  ["currency", rxFull(["currency", "cur\\.?", "ccy", "doviz", "para\\s*birimi", "wahrung", "devise", "moneda"])],
  ["hs", rx(["h\\.?\\s?s\\.?(?:\\s*(?:code|no|nr|kod|kodu|number|tariff)\\.?)?", "gtip", "g\\.\\s?t\\.\\s?i\\.\\s?p\\.?", "tariff(?:\\s*(?:code|no))?", "customs\\s*(?:tariff|code)", "taric", "commodity\\s*code", "zolltarif\\p{L}*", "cn\\s*code", "тн\\s*вэд"])],
  ["net", /(?<![\p{L}\p{N}])(?:net\s*(?:weight|wt|w|kgs?|agirlik|gewicht|poids|peso)|n\.\s?w\.?|nw|net)(?![\p{L}\p{N}])(?!\s*(?:amount|price|value|total|tutar|fiyat|betrag))/u],
  ["gross", /(?<![\p{L}\p{N}])(?:gross\s*(?:weight|wt|w|kgs?|agirlik|gewicht)?|g\.\s?w\.?|gw|brut(?:\s*agirlik)?|brutto(?:gewicht)?|poids\s*brut)(?![\p{L}\p{N}])(?!\s*(?:amount|price|value|total|tutar|fiyat))/u],
  ["weight", rxFull(["weight", "wt\\.?", "agirlik", "gewicht", "poids", "peso", "kgs?\\.?", "weight\\s*kgs?"])],
  ["volume", rx(["volume", "cbm", "m3", "m³", "vol\\.?", "hacim", "kubaj", "volumen"])],
  ["dims", rx(["dimensions?", "dims?\\.?", "measurements?", "meas\\.?", "olcu(?:ler|leri)?", "boyut(?:lar)?", "ebat(?:lar)?", "abmessung(?:en)?", "l\\s*[x×*]\\s*w\\s*[x×*]\\s*h"])],
  ["pkgType", rx(["package\\s*type", "pkg\\.?\\s*type", "type\\s*of\\s*(?:packing|packages?)", "packing\\s*type", "kind\\s*of\\s*packages?", "ambalaj(?:\\s*(?:cinsi|tipi|turu))?", "kap\\s*(?:cinsi|tipi)", "verpackung\\p{L}*"])],
  ["unitPrice", rx(["unit\\s*(?:price|cost|value|rate)", "u\\.\\s?price", "u\\/price", "price\\s*(?:per|\\/)\\s*\\p{L}+", "birim\\s*fiyat\\p{L}*", "b\\.\\s?fiyat", "einzelpreis", "stuckpreis", "prix\\s*unitaire", "p\\.\\s?u\\.?", "precio\\s*unitario", "preco\\s*unitario", "цена\\s*за\\s*ед\\p{L}*"])],
  ["qty", rx(["q'?ty", "qnty", "qtty", "quantity", "quantities", "pcs", "pieces", "miktar\\p{L}*", "adet", "menge", "anzahl", "quantite", "cantidad", "quantidade", "количество", "кол-?во"])],
  ["packages", rx(["packages?", "pkgs?\\.?", "no\\.?\\s*of\\s*(?:pkgs?|packages|cartons|ctns?|boxes|pallets|cases)", "cartons?", "ctns?\\.?", "boxes", "koli(?:\\s*(?:adedi|sayisi))?", "kap(?:\\s*(?:adedi|sayisi))?", "palet(?:\\s*(?:adedi|sayisi))?", "pallets?", "colis", "bultos", "packst\\p{L}*"])],
  ["amount", rx(["total(?:\\s*(?:price|amount|value|cost))?", "amount", "line\\s*total", "ext(?:ended|\\.)?\\s*(?:price|amount|value)", "value", "tutar\\p{L}*", "toplam(?:\\s*(?:fiyat|tutar))?", "betrag", "gesamt\\p{L}*", "montant", "importe", "valor", "сумма", "стоимость"])],
  ["unitPrice", rx(["price", "prices", "rate", "fiyat\\p{L}*", "preis", "prix", "precio", "preco", "цена", "u\\.?p\\.?"])],
  ["unit", rxFull(["unit", "units", "uom", "u\\/m", "um", "unit\\s*of\\s*measure(?:ment)?", "birim", "olcu\\s*birimi", "einheit", "me", "unite", "unidad", "ед\\.?\\s*изм\\.?"])],
  ["origin", rx(["country\\s*of\\s*origin", "origin", "mense\\p{L}*", "made\\s*in", "ursprung\\p{L}*", "origine", "origen", "coo"])],
  ["idx", rxFull(["no\\.?", "#", "nr\\.?", "n°", "s\\.?\\s?no\\.?", "sr\\.?\\s?no\\.?", "sl\\.?\\s?no\\.?", "sira(?:\\s*no)?", "pos\\.?", "position", "lfd\\.?\\s*nr\\.?", "line"])],
  ["code", rx(["code", "item\\s*(?:no|nr|#|code|number)\\.?", "article\\s*(?:no|nr|number|code)\\.?", "art\\.?\\s*(?:no|nr)\\.?", "part\\s*(?:no|number|#)\\.?", "p\\/n", "ref(?:erence)?(?:\\s*no)?", "sku", "model(?:\\s*no)?", "kod(?:u)?", "stok\\s*kodu", "urun\\s*kodu", "malzeme\\s*kodu", "artikel(?:nr|nummer)", "referencia", "codigo", "артикул", "barcode", "ean"])],
  ["desc", rx(["description", "descr\\.?", "desc\\.?", "goods", "commodity", "commodities", "products?", "item\\s*desc\\p{L}*", "particulars", "designation", "descripcion", "descricao", "beschreibung", "bezeichnung", "artikel", "urun\\p{L}*(?:\\s*(?:adi|tanimi|aciklamasi))?", "malzeme\\p{L}*", "aciklama\\p{L}*", "tanim\\p{L}*", "mal\\p{L}*\\s*cinsi", "cinsi", "hizmet", "наименование\\p{L}*", "описание", "товар\\p{L}*", "name", "items?", "article"])],
  ["marks", rx(["marks?(?:\\s*(?:&|and)\\s*(?:nos?|numbers?))?", "shipping\\s*marks?", "marka"])]
];

const NUMERIC_FIELDS = ["qty", "unitPrice", "amount", "net", "gross", "packages", "volume"];
const MONEY_FIELDS = ["qty", "unitPrice", "amount"];

function classifyHeader(text) {
  const n = norm(text).replace(/[:*.]+$/, "").trim();
  if (!n || n.length > 60) return null;
  if (/\d{3,}/.test(n) && !/m3|cbm|20\d\d/.test(n)) return null;
  for (const [field, re] of COL_RULES) if (re.test(n)) return field;
  return null;
}

function headerInfo(row) {
  const cols = [];
  const fields = new Set();
  let numeric = 0, long = 0;
  for (const c of row.cells) {
    const f = classifyHeader(c.text);
    cols.push({ text: c.text, x0: c.x0, x1: c.x1, field: f });
    if (f) { if (f !== "skip" && f !== "idx" && f !== "currency" && f !== "vatRate") fields.add(f); }
    else if (looksNumeric(c.text)) numeric++;
    else if (c.text.length > 40) long++;
  }
  const hasDesc = fields.has("desc") || fields.has("code");
  const hasNum = NUMERIC_FIELDS.some((f) => fields.has(f));
  let score = hasDesc && hasNum ? fields.size : 0;
  if (fields.size >= 4 && (hasDesc || hasNum)) score = Math.max(score, fields.size - 1);
  score -= numeric * 1.5 + long;
  return { score, cols, fields };
}

const overlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);

function findHeader(rows) {
  let best = null;
  rows.forEach((row, i) => {
    if (!row.cells.length || row.cells.length < 2) return;
    const info = headerInfo(row);
    if (info.score >= 2 && (!best || info.score > best.score)) best = { ...info, index: i, endIndex: i, row };
  });
  if (!best) return null;
  // İki satırlı başlık ("Unit" / "Price" alt alta) için bir sonraki satırla birleştirmeyi dene
  const r = best.row, n = rows[best.index + 1];
  if (n && n.group === r.group && n.cells.length && !n.cells.some((c) => looksNumeric(c.text)) &&
      (r.kind !== "pdf" || (n.page === r.page && n.y - r.y < 2.4 * r.h))) {
    const merged = r.cells.map((c) => ({ ...c }));
    for (const c of n.cells) {
      const tol = r.kind === "pdf" ? 2 : 0;
      const target = merged.find((m) => overlap(m, c) > -tol);
      if (target) target.text += " " + c.text; else merged.push({ ...c });
    }
    merged.sort((a, b) => a.x0 - b.x0);
    const mi = headerInfo({ ...r, cells: merged });
    if (mi.score > best.score) best = { ...best, ...mi, endIndex: best.index + 1, row: { ...r, cells: merged } };
  }
  resolveColumns(best.cols);
  return best;
}

function resolveColumns(cols) {
  const has = (f) => cols.some((c) => c.field === f);
  for (const c of cols) {
    if (c.field === "weight") c.field = !has("net") ? "net" : !has("gross") ? "gross" : null;
  }
  const descs = cols.filter((c) => c.field === "desc");
  if (descs.length > 1) {
    const pref = descs.find((c) => /desc|aciklama|tanim|beschreib|designation|описан|наимен|goods|commodit|particular/.test(norm(c.text))) || descs[descs.length - 1];
    descs.forEach((c) => { if (c !== pref) c.field = "desc2"; });
  }
  const qtys = cols.filter((c) => c.field === "qty");
  qtys.slice(1).forEach((c) => { c.field = /ctn|carton|koli|box|pallet|palet|kap|pkg|package/.test(norm(c.text)) && !has("packages") ? "packages" : null; });
  const ups = cols.filter((c) => c.field === "unitPrice");
  if (ups.length > 1 && !has("amount")) ups[ups.length - 1].field = "amount";
  for (const f of ["amount", "unitPrice", "hs", "code", "net", "gross", "packages", "volume", "unit", "pkgType", "dims", "origin"]) {
    cols.filter((c) => c.field === f).slice(1).forEach((c) => { c.field = f === "code" ? "code2" : null; });
  }
}

/* PDF'te sütun sınırları: başlık hücreleri + veri kelimelerinin yatay kapsama kümeleri */
function pdfColumns(headerCols, rows, start) {
  const iv = headerCols.map((h) => ({ x0: h.x0, x1: h.x1 }));
  let prev = null;
  for (let i = start, taken = 0; i < rows.length && taken < 150; i++) {
    const r = rows[i];
    if (r.kind !== "pdf") break;
    if (prev && r.page === prev.page && r.y - prev.y > Math.max(6 * r.h, 60)) break;
    if (isTotalsText(r.cells[0]?.text)) break;
    const nums = r.words.filter((w) => looksNumeric(w.text)).length;
    if (nums >= 2) { r.words.forEach((w) => iv.push({ x0: w.x0, x1: w.x1 })); taken++; prev = r; }
  }
  iv.sort((a, b) => a.x0 - b.x0);
  const clusters = [];
  for (const v of iv) {
    const c = clusters[clusters.length - 1];
    if (c && v.x0 <= c.x1 + 1.5) c.x1 = Math.max(c.x1, v.x1);
    else clusters.push({ x0: v.x0, x1: v.x1 });
  }
  const cols = [];
  for (const cl of clusters) {
    const hs = headerCols.filter((h) => overlap(h, cl) > 0 || ((h.x0 + h.x1) / 2 >= cl.x0 && (h.x0 + h.x1) / 2 <= cl.x1));
    if (hs.length <= 1) cols.push({ x0: cl.x0, x1: cl.x1, field: hs[0]?.field ?? null });
    else {
      hs.sort((a, b) => a.x0 - b.x0);
      hs.forEach((h, k) => {
        const x0 = k === 0 ? cl.x0 : (hs[k - 1].x1 + h.x0) / 2;
        const x1 = k === hs.length - 1 ? cl.x1 : (h.x1 + hs[k + 1].x0) / 2;
        cols.push({ x0, x1, field: h.field });
      });
    }
  }
  return cols;
}

function assign(row, cols, isPdf) {
  const vals = {};
  const put = (field, text, x, num, date) => {
    if (!field || field === "skip" || field === "idx") return;
    const v = vals[field] || (vals[field] = { text: "", x, num: null, date: null });
    v.text = v.text ? v.text + " " + text : text;
    if (num != null && v.num == null) v.num = num;
    if (date && !v.date) v.date = date;
  };
  if (isPdf) {
    for (const w of row.words) {
      const cx = (w.x0 + w.x1) / 2;
      let col = cols.find((c) => cx >= c.x0 - 0.5 && cx <= c.x1 + 0.5);
      if (!col) {
        let best = null, bd = Infinity;
        for (const c of cols) {
          const d = cx < c.x0 ? c.x0 - cx : cx - c.x1;
          if (d < bd) { bd = d; best = c; }
        }
        if (bd <= 14) col = best;
      }
      if (col) put(col.field, w.text, col.x0);
    }
  } else {
    for (const cell of row.cells) {
      let best = null, bo = 0;
      for (const c of cols) {
        const o = overlap(c, cell);
        if (o > bo) { bo = o; best = c; }
      }
      if (best) put(best.field, cell.text, best.x0, cell.num, cell.date);
    }
  }
  return vals;
}

const TOTALS_RE = /^(?:sub\s*-?\s*total|grand\s*total|total|totals|toplam|genel\s*toplam|ara\s*toplam|sum|summe|gesamt\p{L}*|итого|всего|net\s*total)(?![\p{L}])/u;
function isTotalsText(t) { return TOTALS_RE.test(norm(t)); }

/* ------------------------------------------------------------------ Kalem tablosu */

function scanTable(rows, hdr) {
  const hrow = hdr.row;
  const isPdf = hrow.kind === "pdf";
  const start = hdr.endIndex + 1;
  const cols = isPdf ? pdfColumns(hdr.cols, rows, start) : hdr.cols;
  const out = [];          // { kind:'item'|'desc', vals, row, i }
  let totalsVals = null, end = hdr.endIndex;
  let nonItem = 0, blank = 0;
  let lastY = hrow.y, lastPage = hrow.page, lastKind = "header";
  const numericIn = (vals, fields) => fields.some((f) => vals[f] && (vals[f].num != null || looksNumeric(vals[f].text)));

  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    if (!isPdf && row.group !== hrow.group) break;
    if (!row.cells.length) {
      blank++;
      if (!isPdf && blank >= 3 && out.some((o) => o.kind === "item")) break;
      continue;
    }
    blank = 0;
    const items = out.filter((o) => o.kind === "item").length;
    if (isPdf) {
      if (items && row.page === lastPage && row.y - lastY > Math.max(5 * row.h, 48)) break;
      const hi = headerInfo(row);
      if (hi.score >= Math.max(2, hdr.score - 1)) { lastY = row.y; lastPage = row.page; continue; } // sayfa başında tekrar eden başlık
    }
    const vals = assign(row, cols, isPdf);
    const textCells = row.cells.map((c) => c.text);
    const complete = numericIn(vals, ["qty"]) && numericIn(vals, ["unitPrice"]);
    if (textCells.some(isTotalsText) && !complete) { totalsVals = vals; end = i; break; }

    const hasName = ["desc", "desc2", "code", "code2"].some((f) => vals[f]?.text?.trim());
    if (hasName && numericIn(vals, MONEY_FIELDS)) {
      out.push({ kind: "item", vals, row, i });
      nonItem = 0; end = i; lastY = row.y; lastPage = row.page; lastKind = "item";
      continue;
    }
    const onlyDesc = (vals.desc?.text || vals.desc2?.text) && !numericIn(vals, NUMERIC_FIELDS);
    const close = isPdf
      ? row.page === lastPage && row.y - lastY <= 2.3 * row.h
      : lastKind !== "header" && i - (out[out.length - 1]?.i ?? -9) === 1;
    if (onlyDesc && close && items) {
      out.push({ kind: "desc", vals, row, i });
      lastY = row.y; lastPage = row.page; lastKind = "desc";
      continue;
    }
    if (onlyDesc && isPdf && !items && row.y - lastY <= 2.6 * row.h) {
      // ilk kalemin üstüne taşan açıklama satırı
      out.push({ kind: "desc", vals, row, i });
      lastY = row.y; lastPage = row.page; lastKind = "desc";
      continue;
    }
    nonItem++;
    if (items && nonItem >= (isPdf ? 2 : 3)) break;
    if (!items && nonItem >= 8) break;
  }
  return { out, totalsVals, end, isPdf, cols };
}

function vatRateOf(text, dec) {
  const m = String(text ?? "").match(/\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const v = parseNum(m[0], dec);
  return v != null && v >= 0 && v <= 100 ? v : null;
}

function buildItems(scan, dec) {
  const { out, isPdf } = scan;
  const num = (v) => (v ? (v.num != null ? v.num : parseNum(v.text, dec)) : null);
  const items = [];
  const raw = [];
  for (const o of out) {
    if (o.kind !== "item") continue;
    const v = o.vals;
    const g = (f) => (v[f]?.text || "").replace(/\s+/g, " ").trim();
    let desc = (v.desc?.text || "").trim();
    let code = g("code") || g("code2");
    const desc2 = g("desc2");
    if (desc2) {
      if (!code && /^[A-Z0-9][A-Z0-9\-_.\/]{1,24}$/i.test(desc2) && /\d/.test(desc2)) code = desc2;
      else if (!desc) desc = desc2;
      else desc = (v.desc2.x < v.desc.x) ? `${desc2} – ${desc}` : `${desc} – ${desc2}`;
    }
    if (!desc) desc = code;
    if (looksNumeric(desc) && desc === g("desc") && !code) continue;
    let qty = num(v.qty), price = num(v.unitPrice), amount = num(v.amount);
    if (qty != null && price != null && amount == null) amount = round(qty * price, 2);
    if (qty != null && amount != null && price == null && qty !== 0) price = round(amount / qty, 4);
    const unit = normUnit(g("unit")) || unitFromQtyText(v.qty?.text) || "";
    const item = {
      code,
      description: desc.replace(/[ \t]+/g, " ").trim(),
      hsCode: cleanHs(g("hs")) || hsFromText(desc),
      qty, unit, unitPrice: price, amount,
      currency: detectCurrency([g("currency")]) || "",
      vatRate: vatRateOf(v.vatRate?.text, dec),
      packages: num(v.packages),
      packageType: pkgTypeFromText(g("pkgType")) || pkgTypeFromText(v.packages?.text) || "",
      netWeight: num(v.net),
      grossWeight: num(v.gross),
      dimensions: g("dims"),
      volume: num(v.volume),
      origin: g("origin")
    };
    items.push(item);
    raw.push({ item, o });
  }
  // Açıklama devam satırlarını en yakın kaleme bağla
  for (const o of out) {
    if (o.kind !== "desc") continue;
    const text = [o.vals.desc2?.text, o.vals.desc?.text].filter(Boolean).join(" ").trim();
    if (!text || isTotalsText(text)) continue;
    let prev = null, next = null;
    for (const r of raw) {
      if (r.o.i < o.i) prev = r;
      else if (r.o.i > o.i && !next) next = r;
    }
    if (isPdf) {
      const dPrev = prev && prev.o.row.page === o.row.page ? o.row.y - prev.o.row.y : Infinity;
      const dNext = next && next.o.row.page === o.row.page ? next.o.row.y - o.row.y : Infinity;
      if (Math.min(dPrev, dNext) > 2.6 * o.row.h) continue;
      if (dNext < dPrev * 0.8) next.item.description = `${text} ${next.item.description}`.trim();
      else if (prev) prev.item.description = `${prev.item.description} ${text}`.trim();
    } else if (prev) {
      prev.item.description = `${prev.item.description}\n${text}`.trim();
    }
  }
  return items;
}

/* ------------------------------------------------------------------ Etiketler */

const L = (key, prio, alts, weak = []) => ({ key, prio, alts, weak });

const PARTY_RULES = [
  L("seller", 2, ["seller", "exporter", "shipper", "supplier", "vendor", "manufacturer", "satici(?:\\s*firma)?", "ihracatci(?:\\s*firma)?", "gonderici(?:\\s*firma)?", "tedarikci", "verkaufer", "lieferant", "exportateur", "vendeur", "exportador", "vendedor", "продавец", "экспортер", "отправитель"], ["from"]),
  L("buyer", 2, ["buyer", "importer", "sold\\s*to", "bill(?:ed)?\\s*to", "invoice(?:d)?\\s*to", "customer", "messrs\\.?", "purchaser", "client", "alici(?:\\s*firma)?", "musteri", "ithalatci(?:\\s*firma)?", "kaufer", "kunde", "acheteur", "importateur", "comprador", "importador", "cliente", "покупатель", "импортер"], ["to"]),
  L("consignee", 2, ["consignee", "ship\\s*to", "deliver(?:y)?\\s*(?:to|address)", "shipping\\s*address", "receiver", "teslim\\s*alan", "empfanger", "destinataire", "consignatario", "грузополучатель"]),
  L("notify", 2, ["notify(?:\\s*party)?", "also\\s*notify", "ihbar(?:\\s*adresi)?"])
];

const BANK_RULES = [
  L("iban", 2, ["iban(?:\\s*(?:no|number|code))?", "(?:usd|eur|euro|try|tl|gbp)\\s*iban"]),
  L("swift", 2, ["swift(?:\\s*\\/\\s*bic)?(?:\\s*code)?", "bic(?:\\s*code)?", "swift\\s*kodu"]),
  L("accountName", 2, ["account\\s*(?:name|holder)", "beneficiary(?:\\s*name)?", "hesap\\s*(?:sahibi|adi)", "alici\\s*adi", "kontoinhaber", "titulaire", "beneficiario"]),
  L("accountNo", 2, ["account\\s*(?:no|number|nr|#)\\.?", "a\\/c(?:\\s*no)?", "hesap\\s*(?:no|numarasi)", "kontonummer", "numero\\s*de\\s*cuenta"]),
  L("branch", 2, ["branch(?:\\s*(?:name|code))?", "sube(?:\\s*(?:adi|kodu))?", "filiale", "agence", "sucursal", "bank\\s*address"]),
  L("bankName", 2, ["(?:beneficiary\\s*)?bank(?:\\s*name)?", "banka(?:\\s*adi)?", "bankname", "banque", "banco", "банк"])
];

const KV_RULES = [
  L("proformaNo", 4, ["pro-?forma\\s*(?:invoice\\s*)?(?:no|nr|number|num|#)\\.?", "proforma\\s*fatura\\s*(?:no|numarasi)", "(?:p\\.?\\s?i|pfi|pf)\\.?\\s*(?:no|nr|number|#)\\.?", "proforma\\s*#"]),
  L("proformaNo", 3, ["(?:invoice|inv|fatura|rechnung|facture|factura)\\s*(?:no|nr|number|num|#|numarasi)\\.?"]),
  L("proformaNo", 2, ["(?:offer|quotation|quote|teklif|angebot)\\s*(?:no|nr|number|#)\\.?", "(?:document|doc|belge)\\s*(?:no|nr|number|#)\\.?"]),
  L("proformaNo", 1, [], ["no\\.?", "nr\\.?", "number", "numara", "ref(?:erence)?\\s*(?:no)?\\.?"]),
  L("proformaDate", 3, ["(?:proforma|pi|invoice|inv|fatura|document|belge|offer|teklif)\\s*(?:date|tarih\\p{L}*|datum|fecha)", "date\\s*of\\s*(?:issue|invoice)", "issue\\s*date"]),
  L("proformaDate", 1, [], ["date", "tarih\\p{L}*", "datum", "fecha", "дата"]),
  L("orderRef", 2, ["(?:p\\.?\\s?o\\.?|purchase\\s*order|order|siparis|bestellung|commande|pedido)\\s*(?:no|nr|number|ref|#)\\.?", "purchase\\s*order", "(?:customer|your|client|buyer'?s?)\\s*(?:ref|reference|order)(?:\\s*(?:no|#))?\\.?", "(?:contract|sozlesme|kontrakt)\\s*(?:no|nr|number|#)?\\.?"]),
  L("incoterm", 2, ["incoterms?(?:\\s*(?:20\\d\\d|®))?", "(?:delivery|price|trade|shipping)\\s*(?:terms?|conditions?|basis)", "terms\\s*of\\s*delivery", "teslim\\s*(?:sekli|sarti|sartlari|kosulu|kosullari)", "lieferbedingung\\p{L}*", "conditions?\\s*de\\s*livraison", "condiciones\\s*de\\s*entrega"], ["delivery", "teslimat"]),
  L("paymentTerms", 2, ["(?:payment|paiement|pago|zahlung)\\s*(?:terms?|conditions?|method|type|bedingungen)", "terms\\s*of\\s*payment", "odeme(?:\\s*(?:sekli|kosullari|sartlari|kosulu|plani|yontemi))?", "zahlungsbedingungen", "conditions\\s*de\\s*paiement", "forma\\s*de\\s*pago", "условия\\s*оплаты"], ["payment"]),
  L("currency", 2, ["doviz(?:\\s*cinsi)?", "para\\s*birimi", "wahrung", "devise", "moneda", "валюта"], ["currency"]),
  L("countryOrigin", 2, ["country\\s*of\\s*origin", "origin\\s*of\\s*(?:the\\s*)?goods", "mense(?:i|si)?(?:\\s*ulkesi)?", "made\\s*in", "ursprung\\p{L}*", "pays\\s*d.?origine", "pais\\s*de\\s*origen", "страна\\s*происхождения"], ["origin"]),
  L("countryDestination", 2, ["country\\s*of\\s*destination", "destination\\s*country", "varis\\s*ulkesi", "gidecegi\\s*ulke", "bestimmungsland"]),
  L("portLoading", 2, ["port\\s*of\\s*(?:loading|shipment|departure|lading)", "loading\\s*port", "place\\s*of\\s*(?:loading|receipt|dispatch)", "yukleme\\s*(?:limani|yeri)", "cikis\\s*(?:limani|yeri)", "verladehafen", "port\\s*de\\s*chargement", "puerto\\s*de\\s*(?:carga|embarque)", "shipment\\s*from", "from\\s*port"], ["pol"]),
  L("portDischarge", 2, ["port\\s*of\\s*(?:discharge|destination|arrival|unloading)", "(?:discharge|destination|arrival)\\s*port", "bosaltma\\s*(?:limani|yeri)", "varis\\s*limani", "bestimmungshafen", "port\\s*de\\s*dechargement", "puerto\\s*de\\s*(?:destino|descarga)", "to\\s*port"], ["pod"]),
  L("finalDestination", 2, ["final\\s*destination", "place\\s*of\\s*delivery", "varis\\s*yeri", "teslim\\s*yeri"], ["destination"]),
  L("transportMode", 2, ["mode\\s*of\\s*(?:transport|shipment)", "transport(?:ation)?\\s*(?:mode|type|by)", "shipment\\s*(?:by|method|mode|via|type)", "ship(?:ping)?\\s*(?:via|by|method|mode)", "shipped\\s*(?:by|via)", "tasima\\s*(?:sekli|turu)", "sevk(?:iyat)?\\s*(?:sekli|yontemi)", "versandart", "mode\\s*de\\s*transport"], ["via", "transport", "shipment"]),
  L("shipmentDate", 2, ["(?:shipment|shipping|loading|dispatch)\\s*date", "date\\s*of\\s*shipment", "sevk\\s*tarihi", "yukleme\\s*tarihi"]),
  L("vessel", 2, ["vessel(?:\\s*name)?(?:\\s*\\/\\s*voy(?:age)?)?", "flight(?:\\s*no)?", "truck\\s*(?:no|plate)", "plate\\s*no", "gemi(?:\\s*adi)?", "ucus\\s*no", "arac\\s*plaka(?:si)?"]),
  L("containerNo", 2, ["container\\s*(?:no|nr|number|#)\\.?", "konteyner(?:\\s*no)?", "cntr\\s*no"], ["container"])
];

function compile(rule, type) {
  const tail = "(?![\\p{L}\\p{N}])\\s*(?:\\(([^)]{0,24})\\))?\\s*([:：=]|\\.(?!\\d)|-(?=\\s)|–)?\\s*";
  const strong = rule.alts.length ? new RegExp(`^\\s*(?:${rule.alts.join("|")})${tail}`, "u") : null;
  const weak = rule.weak.length ? new RegExp(`^\\s*(?:${rule.weak.join("|")})${tail}`, "u") : null;
  return { ...rule, type, strong, weak };
}
const ALL_RULES = [
  ...PARTY_RULES.map((r) => compile(r, "party")),
  ...BANK_RULES.map((r) => compile(r, "bank")),
  ...KV_RULES.map((r) => compile(r, "kv"))
];

const FILLER = /^(?:(?:sube|subesi|branch|name|names|details?|information|info|address(?:es)?|adi|adresi|bilgileri|bilgisi|unvani|and|ve|&|\/|,)\s*)+/;
const NO_COLON_OK = new Set(["iban", "swift", "incoterm", "currency", "proformaDate", "proformaNo"]);

/** Satır başındaki etiketi bulur. Dönüş: { type, key, prio, rest, colon, paren } */
function matchLabel(text) {
  const raw = String(text ?? "").replace(/^[\s•·▪●■◦*]+/, "");
  const f = fold(raw);
  let best = null;
  for (const r of ALL_RULES) {
    for (const [re, isWeak] of [[r.strong, false], [r.weak, true]]) {
      if (!re) continue;
      const m = re.exec(f);
      if (!m) continue;
      let rest = raw.slice(m[0].length).trim();
      let colon = !!m[2];
      // "Exporter Name & Address:" → dolgu kelimelerini at
      const fm = FILLER.exec(fold(rest));
      if (fm && fm[0].length) {
        const after = rest.slice(fm[0].length);
        if (/^\s*[:：]/.test(after) || !after.trim()) {
          colon = colon || /^\s*[:：]/.test(after);
          rest = after.replace(/^\s*[:：]\s*/, "").trim();
        }
      }
      if (rest && !colon) {
        if (isWeak) {
          const ok = (r.key === "proformaDate" && parseDate(rest)) || (r.key === "currency" && detectCurrency([rest]));
          if (!ok) continue;
        } else {
          const labelText = m[0].trim().replace(/[:：=.\-–]+$/, "").trim();
          if (!/\s/.test(labelText) && !NO_COLON_OK.has(r.key)) continue;
          if (r.key === "bankName" && /^(details|information|info|bilgileri|account|hesap)/i.test(rest)) continue;
        }
      }
      const len = m[0].replace(/[\s:：=.\-–]+$/, "").length;
      if (!best || len > best.len || (len === best.len && r.prio > best.prio)) {
        best = { type: r.type, key: r.key, prio: r.prio - (isWeak ? 0.5 : 0), rest, colon, paren: m[1] || "", len, weak: isWeak };
      }
    }
  }
  return best;
}

function cutAtNextLabel(v) {
  let s = String(v ?? "").trim();
  const m = s.match(/\s{3,}|\s+(?=[A-Za-zÇĞİÖŞÜçğıöşü][A-Za-zÇĞİÖŞÜçğıöşü.\/ ]{1,24}\s?:\s)/);
  if (m && m.index > 0) s = s.slice(0, m.index);
  return s.replace(/^[:：\-–\s]+/, "").trim();
}

function rowsBelow(rows, ri, anchor, rightLimit, maxLines = 9) {
  const row = rows[ri];
  const isPdf = row.kind === "pdf";
  const tol = isPdf ? 14 : 0;
  const out = [];
  let prevY = row.y;
  for (let j = ri + 1; j < rows.length && out.length < maxLines; j++) {
    const r = rows[j];
    if (r.group !== row.group) break;
    // Etiket ile ilk satır arası (kutu dolgusu) daha geniş, sonraki satırlar arası daha dar boşluk kabul edilir
    if (isPdf && (r.page !== row.page || r.y - prevY > (out.length ? 3.2 : 5) * Math.max(r.h, row.h))) break;
    if (!r.cells.length) { if (out.length) break; continue; }
    const cs = r.cells.filter((c) => c.x0 >= anchor.x0 - tol && c.x0 < rightLimit - (isPdf ? 4 : 0));
    if (!cs.length) { if (out.length || !isPdf) break; prevY = r.y; continue; }
    const t = cs.map((c) => c.text).join(" ").trim();
    const lab = matchLabel(t);
    if (lab && (lab.type !== "kv" || lab.prio >= 2)) break;
    if (headerInfo(r).score >= 3) break;
    out.push(...t.split("\n"));
    prevY = r.y;
  }
  return out;
}

const COMPANY_RE = /(?:^|[\s,(])(?:ltd|limited|llc|l\.l\.c|gmbh|inc|incorporated|corp|corporation|co\.?\s*,?\s*ltd|a\.?\s?s|sti|san\.?\s*ve\s*tic|s\.?a\.?r\.?l|s\.?r\.?l|s\.?p\.?a|b\.?v|n\.?v|ag|plc|pte|pvt|jsc|ooo|oy|company|trading|holding|group|sanayi|ticaret)(?:\.|,|\)|\s|$)/;
const ADDRESS_RE = /\b(?:cad|cd|cadde|caddesi|sok|sk|sokak|mah|mh|mahalle|mahallesi|bulvar|blv|no|st|street|road|rd|avenue|ave|floor|kat|zone|osb|bldg|building|apt|daire|plaza|po\s*box|p\.?o\.?\s*box)\b|\b\d{4,6}\b|\d+\s*[/-]\s*\d+|^\d+\s/;

function looksLikeAddress(l) {
  const f = fold(l);
  return ADDRESS_RE.test(f) || /\b(?:turkiye|turkey|china|germany|italy|spain|france|india|usa|u\.s\.a|united|uk|uae|poland|romania|egypt|iraq|russia|korea|japan)\b/.test(f) && f.split(/[\s,]+/).length <= 4 || /^[\d.,\s/-]+$/.test(f);
}

function buildParty(lines) {
  const p = { name: "", address: "", taxId: "", contact: "" };
  const addr = [], contact = [], tax = [];
  for (const raw of lines) {
    const l = String(raw).trim();
    if (!l) continue;
    const f = fold(l);
    if (/^(vat|tax|vergi|v\.\s?d\.?|vkn|tckn|eori|inn|ust-?id|tin|nip|trn|gst|nif|cnpj|ruc|rfc|tax\s*(id|no|number|office))/.test(f) ||
        /^(vergi\s*(no|dairesi|numarasi))/.test(f)) {
      tax.push(l.replace(/^[^:]*:\s*/, "").trim() || l);
    } else if (/@|^(tel|phone|fax|gsm|mob|mobile|e-?mail|web|www|telefon|tlf|cep)\b|^[tfepm]\s*[:.]\s*[+\d]/.test(f) || /^\+?\d[\d\s()\-/]{7,}$/.test(l)) {
      contact.push(l);
    } else {
      addr.push(l);
    }
  }
  // Firma adını içeriğe bakarak seç: şirket eki olan satır > adrese benzemeyen ilk satır > ilk satır
  let ni = addr.findIndex((l) => COMPANY_RE.test(fold(l)) && !ADDRESS_RE.test(fold(l)));
  if (ni < 0) ni = addr.findIndex((l) => COMPANY_RE.test(fold(l)));
  if (ni < 0) ni = addr.findIndex((l) => !looksLikeAddress(l));
  if (ni < 0) ni = 0;
  if (addr.length) p.name = addr.splice(ni, 1)[0];
  p.address = addr.slice(0, 5).join("\n");
  p.taxId = tax.join(" / ");
  p.contact = contact.join(" · ");
  return p;
}

function partyFromLabel(rows, ri, ci, li, lines, lab) {
  const row = rows[ri];
  const cell = row.cells[ci];
  const block = [];
  if (lab.rest) block.push(lab.rest);
  // Aynı hücredeki sonraki satırlar
  let k = li + 1;
  for (; k < lines.length; k++) {
    const l2 = matchLabel(lines[k]);
    if (l2 && (l2.type === "party" || l2.prio >= 2)) break;
    block.push(lines[k]);
  }
  if (block.length && k < lines.length) return { party: buildParty(block), consumed: k };
  if (block.length > 1 || lines.length > 1) return { party: buildParty(block), consumed: k };
  // Sağdaki hücre ya da alt satırlar
  let anchor = cell;
  if (!block.length) {
    const nbIdx = row.cells.findIndex((c, idx) => idx > ci && c.text.trim() && !/^[:：]$/.test(c.text.trim()));
    const nb = nbIdx >= 0 ? row.cells[nbIdx] : null;
    const near = nb && (row.kind === "pdf" ? nb.x0 - cell.x1 < 140 : nb.x0 - cell.x1 <= 1);
    if (near && !matchLabel(nb.text)) { block.push(...nb.text.split("\n")); anchor = nb; }
  } else if (row.kind === "pdf") {
    anchor = { x0: cell.x0 + (cell.text.length - lab.rest.length) * ((cell.x1 - cell.x0) / Math.max(1, cell.text.length)), x1: cell.x1 };
  }
  let rightLimit = Infinity;
  for (let c = 0; c < row.cells.length; c++) {
    const cc = row.cells[c];
    if (cc.x0 > anchor.x0 + 1 && cc !== anchor && matchLabel(cc.text)) { rightLimit = cc.x0; break; }
  }
  if (rightLimit === Infinity) {
    if (row.kind === "pdf") {
      const next = row.cells.find((cc) => cc.x0 > anchor.x1 + 30 && cc !== anchor);
      if (next) rightLimit = next.x0;
    } else {
      const next = row.cells.find((cc) => cc.x0 >= anchor.x1 && cc !== anchor && cc !== cell);
      rightLimit = next ? next.x0 : anchor.x1 + 4;
    }
  }
  block.push(...rowsBelow(rows, ri, { x0: Math.min(anchor.x0, cell.x0 + (row.kind === "pdf" ? 0 : 0)), x1: anchor.x1 }, rightLimit));
  return { party: buildParty(block), consumed: lines.length };
}

function kvFromLabel(rows, ri, ci, li, lines, lab) {
  let v = cutAtNextLabel(lab.rest);
  const row = rows[ri];
  const cell = row.cells[ci];
  let date = null, num = null;
  if (!v && li + 1 < lines.length && !matchLabel(lines[li + 1])) v = lines[li + 1].trim();
  if (!v && lines.length === 1) {
    for (let k = ci + 1; k < row.cells.length; k++) {
      const c = row.cells[k];
      const t = c.text.trim();
      if (!t || /^[:：]$/.test(t)) continue;
      if (matchLabel(t)) break;
      if (row.kind === "pdf" && c.x0 - cell.x1 > 220) break;
      v = cutAtNextLabel(t.replace(/^[:：]\s*/, ""));
      date = c.date || null; num = c.num ?? null;
      break;
    }
    if (!v && !lab.weak) {
      const below = rowsBelow(rows, ri, cell, cell.x1 + (row.kind === "pdf" ? 220 : 1), 1);
      if (below.length) v = below[0].trim();
    }
  }
  if (v && !date && row.kind === "pdf" && !NO_WRAP.has(lab.key)) v = appendWrapped(rows, ri, ci, lab, v);
  return { value: v, date, num };
}

const NO_WRAP = new Set(["proformaDate", "shipmentDate", "currency", "incoterm", "iban", "swift"]);

/** Değer alt satıra taşmışsa (aynı hizada, solunda etiket olmayan satır) devamını ekler. */
function appendWrapped(rows, ri, ci, lab, v) {
  const row = rows[ri];
  const cell = row.cells[ci];
  // Değer etiketle aynı hücredeyse hizası hücrenin başı, değilse sağdaki hücrenin başı
  let vx = cell.x0, sameCell = !!lab.rest;
  if (!sameCell) {
    const nb = row.cells.slice(ci + 1).find((c) => c.text.trim() && !/^[:：]$/.test(c.text.trim()));
    if (!nb) return v;
    vx = nb.x0;
  }
  let prevY = row.y;
  for (let j = ri + 1, n = 0; j < rows.length && n < 2; j++, n++) {
    const r = rows[j];
    if (r.page !== row.page || r.y - prevY > 2.6 * Math.max(r.h, row.h)) break;
    const lo = vx - 3, hi = vx + (sameCell ? 16 : 3);
    const cand = r.cells.find((c) => c.x0 >= lo && c.x0 <= hi);
    if (!cand) { prevY = r.y; continue; }
    const t = cand.text.trim();
    if (!t || matchLabel(t) || /:\s*$/.test(t)) break;
    // Aynı satırda adayın solunda/hizasında etiket varsa bu yeni bir alandır
    if (r.cells.some((c) => c !== cand && c.x0 <= cand.x0 && (matchLabel(c.text) || /:\s*$/.test(c.text.trim())))) break;
    if (headerInfo(r).score >= 3) break;
    v = `${v}${/[-/]$/.test(v) ? "" : " "}${t}`.trim();
    prevY = r.y;
  }
  return v;
}

/* Bölüm başlığı + "Etiket: değer" çiftleri (ör. MÜŞTERİ BİLGİLERİ → Firma Adı:, Adres:, VD / VKN:) */
const SUB_FIELDS = [
  ["name", /^(?:firma|sirket|musteri|alici|unvan|company|customer|client|buyer|consignee)\s*(?:adi|unvani|name|ismi)?$|^(?:unvan|name|adi|ad|company)$/],
  ["address", /^(?:adres|address|addr)/],
  ["tax", /^(?:vd|vkn|v\.?d\.?|vergi|tax|vat|tin|eori|tckn|ust)/],
  ["contact", /^(?:ilgili|yetkili|kisi|contact|tel|telefon|phone|gsm|cep|e-?posta|e-?mail|mail|fax|faks|web)/]
];

function subFieldParty(rows, ri, ci) {
  const row = rows[ri];
  const head = row.cells[ci];
  if (row.kind !== "pdf" || row.cells.length !== 1) return null;
  const fields = [];
  let last = null, prevY = row.y;
  for (let j = ri + 1; j < rows.length; j++) {
    const r = rows[j];
    if (r.page !== row.page || r.y - prevY > 3.2 * Math.max(r.h, row.h)) break;
    const lc = r.cells.find((c) => Math.abs(c.x0 - head.x0) <= 6);
    const labelCell = lc && /^[^:]{1,30}:$/.test(lc.text.trim()) ? lc : null;
    if (labelCell) {
      const kind = SUB_FIELDS.find(([, re]) => re.test(fold(labelCell.text).replace(/[:\s]+$/, "")));
      // Değer: etiketin sağındaki ilk hücre (sonraki etiket hücresine kadar)
      const idx = r.cells.indexOf(labelCell);
      const nextLab = r.cells.findIndex((c, k) => k > idx + 1 && /:\s*$/.test(c.text.trim()));
      const end = nextLab < 0 ? r.cells.length : nextLab;
      const val = r.cells[idx + 1];
      if (val && idx + 1 < end) {
        // Yalnızca bitişik hücreler: büyük boşluktan sonrası sağ sütundur
        let stop = idx + 2;
        while (stop < end && r.cells[stop].x0 - r.cells[stop - 1].x1 < 40) stop++;
        last = { kind: kind ? kind[0] : "other", text: r.cells.slice(idx + 1, stop).map((c) => c.text.trim()).join(" "), x0: val.x0, x1: val.x1 };
        fields.push(last);
      } else last = null;
      // Aynı satırdaki sağ sütun etiketleri başka alanlara aittir; burada işlenmez
      prevY = r.y;
      continue;
    }
    // Yalnızca sağ sütunu olan satırı atla (sol sütundaki blok sürer)
    if (!r.cells.some((c) => c.x0 <= head.x0 + 6) && !(last && r.cells.some((c) => Math.abs(c.x0 - last.x0) <= 4 && !matchLabel(c.text) && !/:\s*$/.test(c.text.trim())))) {
      prevY = r.y;
      continue;
    }
    // Devam satırı: önceki değerin hizasında, solunda etiket olmayan hücre
    const cont = last && r.cells.find((c) => Math.abs(c.x0 - last.x0) <= 4 && !matchLabel(c.text) && !/:\s*$/.test(c.text.trim()));
    if (cont && !r.cells.some((c) => c.x0 < cont.x0 - 4 && /:\s*$/.test(c.text.trim()) && Math.abs(c.x0 - head.x0) <= 6)) {
      last.text += " " + cont.text.trim();
      prevY = r.y;
      continue;
    }
    break;
  }
  if (!fields.some((f) => f.kind === "name")) return null;
  const pick = (k) => fields.filter((f) => f.kind === k).map((f) => f.text);
  return {
    name: pick("name")[0],
    address: pick("address").join("\n"),
    taxId: pick("tax").join(" / "),
    contact: [...pick("contact")].join(" · ")
  };
}

/* ------------------------------------------------------------------ Ana analiz */

export function analyze(rows) {
  const res = {
    meta: { proformaNo: "", proformaDate: "", orderRef: "", currency: "" },
    seller: null, buyer: null, consignee: null, notify: null,
    shipment: { incoterm: "", incotermPlace: "", paymentTerms: "", transportMode: "", portLoading: "", portDischarge: "", finalDestination: "", countryOrigin: "", countryDestination: "", vessel: "", containerNo: "", shipmentDate: "" },
    items: [],
    charges: { freight: null, insurance: null, discount: null, other: null, otherLabel: "", vat: null, vatRate: null },
    packingTotals: { packages: null, packageType: "", net: null, gross: null, volume: null },
    bank: { bankName: "", branch: "", accountName: "", iban: "", swift: "", accountNo: "" },
    docSubtotal: null, docTotal: null,
    guessed: [], warnings: [], decimal: "."
  };

  /* 1) Kalem tablosu */
  const hdr = findHeader(rows);
  let tStart = -1, tEnd = -1, scan = null;
  if (hdr) {
    scan = scanTable(rows, hdr);
    tStart = hdr.index; tEnd = scan.end;
  }
  const inTable = (i) => tStart >= 0 && i >= tStart && i <= tEnd;

  /* 2) Ondalık ayırıcı: yalnızca sayısal sütunlardaki ve tablo sonrası metinlerden */
  const numTexts = [];
  if (scan) {
    for (const o of scan.out) for (const f of NUMERIC_FIELDS) if (o.vals[f] && o.vals[f].num == null) numTexts.push(o.vals[f].text);
    if (scan.totalsVals) for (const f of NUMERIC_FIELDS) if (scan.totalsVals[f]) numTexts.push(scan.totalsVals[f].text);
  }
  rows.forEach((row, i) => {
    if (inTable(i)) return;
    for (const c of row.cells) {
      if (c.num != null) continue;
      if (/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,}/.test(c.text)) continue; // IBAN
      if (SUMMARY_RULES.some(([, re]) => re.test(c.text)) || /freight|insurance|navlun|sigorta|total|toplam|discount|iskonto/i.test(c.text)) {
        numTexts.push(...numberTokens(c.text));
      }
    }
  });
  const dec = detectDecimalSep(numTexts);
  res.decimal = dec;

  if (scan) {
    res.items = buildItems(scan, dec);
    if (scan.totalsVals) {
      const tv = scan.totalsVals;
      const n = (f) => (tv[f] ? (tv[f].num != null ? tv[f].num : parseNum(tv[f].text, dec)) : null);
      res.docSubtotal = n("amount");
      res.packingTotals.net = n("net");
      res.packingTotals.gross = n("gross");
      res.packingTotals.packages = n("packages");
      res.packingTotals.volume = n("volume");
    }
    // Para birimi sütun başlığında olabilir: "Amount (USD)"
    const headTexts = hdr.cols.filter((c) => ["amount", "unitPrice", "currency"].includes(c.field)).map((c) => c.text);
    const hc = detectCurrency(headTexts);
    if (hc) res.meta.currency = hc;
    if (!res.shipment.incoterm) {
      const hi = hdr.cols.map((c) => findIncoterm(c.text, true)).find(Boolean);
      if (hi) res.shipment.incoterm = hi.code;
    }
  }

  /* 3) Etiketli alanlar (tablo dışı satırlar) */
  const found = {};
  const setKv = (key, value, prio) => {
    if (value == null || value === "") return;
    if (found[key] && found[key].prio >= prio) return;
    found[key] = { value, prio };
  };
  const parties = {};
  const bankBits = {};
  const ibanHits = [];

  rows.forEach((row, ri) => {
    if (inTable(ri)) return;
    row.cells.forEach((cell, ci) => {
      const lines = cell.text.split("\n");
      for (let li = 0; li < lines.length; li++) {
        const lab = matchLabel(lines[li]);
        if (!lab) continue;
        if (lab.type === "party") {
          if (parties[lab.key] && parties[lab.key].prio >= lab.prio) continue;
          const sub = !lab.rest && lines.length === 1 ? subFieldParty(rows, ri, ci) : null;
          if (sub) { parties[lab.key] = { party: sub, prio: lab.prio + 0.5 }; continue; }
          const { party, consumed } = partyFromLabel(rows, ri, ci, li, lines, lab);
          if (party.name) parties[lab.key] = { party, prio: lab.prio };
          li = consumed - 1;
          continue;
        }
        const { value, date, num } = kvFromLabel(rows, ri, ci, li, lines, lab);
        if (!value && !date) continue;
        if (lab.type === "bank") {
          if (!bankBits[lab.key]) bankBits[lab.key] = { value, paren: lab.paren, row: ri };
          continue;
        }
        switch (lab.key) {
          case "proformaNo": {
            const v = value.split(/\s{2,}|\s+(?=date|tarih|datum)/i)[0].trim();
            if (/\d/.test(v) && v.length <= 40 && !parseDate(v)) setKv("proformaNo", v, lab.prio);
            break;
          }
          case "proformaDate": {
            const d = parseDate(date || value);
            if (d) setKv("proformaDate", d, lab.prio);
            break;
          }
          case "shipmentDate": {
            const d = parseDate(date || value);
            if (d) setKv("shipmentDate", d, lab.prio);
            break;
          }
          case "currency": {
            const c = detectCurrency([value]);
            if (c) setKv("currency", c, lab.prio + 2);
            break;
          }
          case "incoterm": {
            const inc = findIncoterm(value);
            if (inc) setKv("incoterm", inc, lab.prio);
            break;
          }
          case "transportMode":
            setKv("transportMode", transportFromText(value) || value.toUpperCase().slice(0, 30), lab.prio);
            break;
          default:
            if (num != null && !value) break;
            setKv(lab.key, value.slice(0, 80), lab.prio);
        }
      }
      // IBAN'lar etiketten bağımsız da aranır
      const up = cell.text.toUpperCase();
      const re = /\b([A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?)\b/g;
      let m;
      while ((m = re.exec(up))) {
        const ctx = [rows[ri - 1]?.cells.map((c) => c.text).join(" ") || "", row.cells.map((c) => c.text).join(" ")].join(" ");
        ibanHits.push({ iban: m[1].replace(/\s+/g, " ").trim(), ctx });
      }
    });
  });

  for (const k of ["proformaNo", "proformaDate", "orderRef"]) if (found[k]) res.meta[k] = found[k].value;
  if (found.currency) res.meta.currency = found.currency.value;
  if (found.incoterm) { res.shipment.incoterm = found.incoterm.value.code; res.shipment.incotermPlace = found.incoterm.value.place; }
  for (const k of ["paymentTerms", "transportMode", "portLoading", "portDischarge", "finalDestination", "countryOrigin", "countryDestination", "vessel", "containerNo", "shipmentDate"]) {
    if (found[k]) res.shipment[k] = found[k].value;
  }
  for (const k of ["seller", "buyer", "consignee", "notify"]) if (parties[k]) res[k] = parties[k].party;

  /* 4) Banka */
  if (bankBits.bankName) res.bank.bankName = bankBits.bankName.value;
  if (bankBits.branch) res.bank.branch = bankBits.branch.value;
  if (bankBits.accountName) res.bank.accountName = bankBits.accountName.value;
  if (bankBits.accountNo) res.bank.accountNo = bankBits.accountNo.value;
  if (bankBits.swift) {
    const sw = bankBits.swift.value.toUpperCase().match(/\b[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/);
    if (sw) res.bank.swift = sw[0];
  }

  /* 5) Toplamlar, navlun, sigorta, ağırlık özetleri */
  const lastNumber = (row) => {
    for (let k = row.cells.length - 1; k >= 0; k--) {
      const c = row.cells[k];
      if (c.num != null) return c.num;
      if (looksNumeric(c.text) && !/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(c.text)) {
        const v = parseNum(c.text, dec);
        if (v != null) return v;
      }
    }
    return null;
  };
  const lastInText = (text) => {
    const toks = numberTokens(text);
    return toks.length ? parseNum(toks[toks.length - 1], dec) : null;
  };
  const totalsRow = scan?.totalsVals ? tEnd : -1;
  const pt = res.packingTotals;
  rows.forEach((row, ri) => {
    if (inTable(ri) && ri !== totalsRow) return;
    const text = row.cells.map((c) => c.text).join("  ");
    const f = norm(text);
    if (!f || f.length > 240) return;

    // Ağırlık / kap / hacim özetleri (tablonun içi hariç her yerde)
    if (ri !== totalsRow) {
      for (const [key, re] of SUMMARY_RULES) {
        const m = text.match(re);
        const raw = firstGroup(m);
        if (raw == null || pt[key] != null) continue;
        const v = parseNum(raw, dec);
        if (v == null || v <= 0) continue;
        if (key === "packages") {
          if (!Number.isInteger(v) || v > 100000) continue;
          pt.packageType = pt.packageType || pkgTypeFromText(m[0]) || pkgTypeFromText(text);
        }
        pt[key] = v;
      }
    }

    const after = tEnd >= 0 && ri >= tEnd;
    if (!after) return;
    const v = lastNumber(row) ?? lastInText(text);
    if (v == null) return;
    if (/\b(freight|navlun|nakliye|fracht|fret|flete|shipping\s*(cost|charge|fee))\b/.test(f) && !/prepaid|collect|odenmis/.test(f)) {
      if (res.charges.freight == null) res.charges.freight = Math.abs(v);
    } else if (/\b(insurance|sigorta|versicherung|assurance|seguro)\b/.test(f)) {
      if (res.charges.insurance == null) res.charges.insurance = Math.abs(v);
    } else if (/\b(kdv|vat|tva|mwst|iva|katma\s*deger)\b/.test(f) && !/\b(no|number|id|nr|vkn)\b/.test(f)) {
      if (res.charges.vat == null) {
        res.charges.vat = Math.abs(v);
        const rm = text.match(/%\s*(\d{1,2}(?:[.,]\d{1,2})?)|(\d{1,2}(?:[.,]\d{1,2})?)\s*%/);
        if (rm) res.charges.vatRate = parseNum(rm[1] || rm[2], dec);
      }
    } else if (/\b(discount|iskonto|indirim|rabatt|remise|descuento)\b/.test(f)) {
      if (res.charges.discount == null) res.charges.discount = Math.abs(v);
    } else if (/\b(packing\s*(cost|charge)|ambalaj\s*(bedeli|ucreti)|verpackungskosten)\b/.test(f)) {
      if (res.charges.other == null) { res.charges.other = Math.abs(v); res.charges.otherLabel = "PACKING CHARGE"; }
    } else if (/\b(net|gross|brut|weight|agirlik|cbm|volume|hacim|packages|cartons|koli)\b/.test(f)) {
      // özet satırı: yukarıda işlendi
    } else if (/\b(grand\s*total|total\s*(amount|value|invoice|payable|due)|genel\s*toplam|toplam\s*tutar|gesamtbetrag|total\s*(exw|fca|fas|fob|cfr|cif|cpt|cip|dap|dpu|ddp)|total)\b|^toplam/.test(f)) {
      res.docTotal = v;
      if (!res.shipment.incoterm) {
        const inc = findIncoterm(text, true);
        if (inc) res.shipment.incoterm = inc.code;
      }
    }
  });

  /* 5b) KDV: belge düzeyindeki oran kalemlere yayılır; kalem oranlarından hesaplanan tutar
         belgedeki tutarla uyuşuyorsa ayrıca tutar yazılmaz (kalemlerden otomatik hesaplanır) */
  res.docVat = res.charges.vat;
  if (res.items.length) {
    const rate = res.charges.vatRate;
    if (rate != null && !res.items.some((it) => it.vatRate != null)) for (const it of res.items) it.vatRate = rate;
    if (res.items.some((it) => it.vatRate != null)) {
      const calc = round(res.items.reduce((s2, it) => s2 + (it.amount || 0) * (it.vatRate || 0) / 100, 0), 2);
      if (res.charges.vat == null || Math.abs(calc - res.charges.vat) <= Math.max(0.05, calc * 0.002)) {
        if (res.charges.vat != null) res.charges.vat = null;
        res.charges.vatRate = null;
      }
    }
  }

  /* 6) IBAN seçimi (para birimine uyan öncelikli) */
  if (!res.meta.currency) res.meta.currency = detectCurrency(rows.flatMap((r) => r.cells.map((c) => c.text))) || "";
  if (ibanHits.length) {
    const cur = res.meta.currency;
    const curRe = cur ? new RegExp(`\\b(${cur}|${cur === "EUR" ? "EURO" : cur === "TRY" ? "TL" : cur})\\b`, "i") : null;
    const pick = (curRe && ibanHits.find((h) => curRe.test(h.ctx))) || ibanHits[0];
    res.bank.iban = pick.iban;
  }

  /* 7) Incoterms yedek arama (büyük harfli kod) */
  if (!res.shipment.incoterm) {
    for (let i = 0; i < rows.length; i++) {
      if (inTable(i) && i !== tEnd) continue;
      for (const c of rows[i].cells) {
        const inc = findIncoterm(c.text, true);
        if (inc && !/^\d/.test(c.text)) { res.shipment.incoterm = inc.code; if (!res.shipment.incotermPlace) res.shipment.incotermPlace = inc.place; break; }
      }
      if (res.shipment.incoterm) break;
    }
  }

  /* 8) Satıcı tahmini: belgenin en üstündeki etiketsiz satırlar */
  if (!res.seller) {
    const TITLE = /proforma|invoice|fatura|teklif|quotation|offer|page|sayfa|^date|^tarih/;
    const usable = (l) => {
      const n = norm(l);
      return n && !TITLE.test(n) && !(parseDate(l) && l.length < 20) && !/^[\d\s.,/-]+$/.test(l) && !matchLabel(l);
    };
    let lines = null;
    for (let i = 0; i < rows.length && i < 14 && !lines; i++) {
      if (inTable(i)) break;
      const row = rows[i];
      if (row.cells[0] && matchLabel(row.cells[0].text)?.type === "party") break;
      for (let ci = 0; ci < row.cells.length; ci++) {
        const c = row.cells[ci];
        const own = c.text.split("\n").map((l) => l.trim()).filter(usable);
        if (!own.length) continue;
        // Firma adı bulundu: aynı hücredeki satırlar + altındaki satırlar (sağdaki sütun hariç)
        const next = row.cells.slice(ci + 1).find((x) => x.text.trim());
        const right = next ? next.x0 : (row.kind === "pdf" ? Infinity : c.x1 + 4);
        const below = c.text.includes("\n") ? [] : rowsBelow(rows, i, c, right, 5);
        lines = [...own, ...below];
        break;
      }
    }
    if (lines) {
      const cut = lines.findIndex((l) => TITLE.test(norm(l)) || matchLabel(l));
      if (cut > 0) lines = lines.slice(0, cut);
      res.seller = buildParty(lines.slice(0, 6));
      if (res.seller.name) res.guessed.push("seller"); else res.seller = null;
    }
  }

  /* 8b) Tahmin edilen satıcı yanlış olabilir: banka hesap sahibi şirket adı taşıyorsa onu esas al,
         antet satırlarından adres / iletişim / vergi bilgilerini topla */
  if (res.seller && res.guessed.includes("seller") && res.bank.accountName && COMPANY_RE.test(fold(res.bank.accountName))) {
    const nameKey = fold(res.bank.accountName).replace(/[^a-z0-9]+/g, " ").trim();
    const addr = [], contact = [], tax = [];
    for (let i = 0; i < rows.length && i < 10; i++) {
      if (inTable(i)) break;
      const row = rows[i];
      if (row.cells.some((c) => matchLabel(c.text)?.type === "party" || /proforma|invoice|fatura/i.test(c.text) && c.text.length < 40)) break;
      for (const c of row.cells) {
        for (const piece of c.text.split(/\s\|\s|\n/).map((x) => x.trim()).filter(Boolean)) {
          const f = fold(piece);
          const pk = f.replace(/[^a-z0-9]+/g, " ").trim();
          if (pk && nameKey.includes(pk)) continue; // unvanın parçaları
          if (/@|^(?:tel|telefon|phone|faks|fax|e-?posta|e-?mail|web|www|gsm)\b/.test(f)) contact.push(piece);
          else if (/^(?:vergi|vkn|vat|tax|ticaret\s*sicil|mersis|tckn)/.test(f)) tax.push(piece);
          else addr.push(piece.replace(/^(?:merkez|adres|address|head\s*office|genel\s*mudurluk)\s*:\s*/i, ""));
        }
      }
    }
    res.seller = { name: res.bank.accountName, address: addr.slice(0, 3).join("\n"), taxId: tax.join(" / "), contact: contact.join(" · ") };
  }

  /* 9) Incoterms yerinden liman tahmini */
  const sh = res.shipment;
  if (sh.incoterm && sh.incotermPlace) {
    if (["EXW", "FCA", "FAS", "FOB"].includes(sh.incoterm) && !sh.portLoading) sh.portLoading = sh.incotermPlace;
    if (["CFR", "CIF", "CPT", "CIP"].includes(sh.incoterm) && !sh.portDischarge) sh.portDischarge = sh.incotermPlace;
    if (["DAP", "DPU", "DDP"].includes(sh.incoterm) && !sh.finalDestination) sh.finalDestination = sh.incotermPlace;
  }

  /* 10) Kontroller ve uyarılar */
  let mismatch = 0;
  for (const it of res.items) {
    if (it.qty != null && it.unitPrice != null && it.amount != null) {
      const exp = it.qty * it.unitPrice;
      if (Math.abs(exp - it.amount) > Math.max(0.02, Math.abs(it.amount) * 0.005)) mismatch++;
    }
  }
  if (mismatch) res.warnings.push({ key: "warn.mismatch", vars: { n: mismatch }, level: "warn" });
  const sum = round(res.items.reduce((s, it) => s + (it.amount || 0), 0), 2);
  res.itemsSum = sum;
  const ref = res.docSubtotal ?? res.docTotal;
  if (res.items.length && ref != null) {
    const charges = (res.charges.freight || 0) + (res.charges.insurance || 0) + (res.charges.other || 0) + (res.docVat || 0) - (res.charges.discount || 0);
    const okSub = Math.abs(sum - ref) <= Math.max(0.05, ref * 0.001);
    const okTot = res.docTotal != null && Math.abs(sum + charges - res.docTotal) <= Math.max(0.05, res.docTotal * 0.001);
    if (okSub || okTot) res.warnings.push({ key: "warn.totalOk", vars: { v: res.docTotal ?? ref }, level: "ok", fmt: ["v"] });
    else res.warnings.push({ key: "warn.totalDiff", vars: { calc: sum, doc: ref }, level: "warn", fmt: ["calc", "doc"] });
  }
  if (!res.items.length) res.warnings.push({ key: "warn.noItems", level: "warn" });
  const hasWeights = res.items.some((it) => it.netWeight != null || it.grossWeight != null);
  if (res.items.length && !hasWeights) {
    const tot = res.packingTotals;
    res.warnings.push({ key: tot.net != null || tot.gross != null ? "warn.totalsOnly" : "warn.noWeights", level: "info" });
  }
  if (!res.buyer) res.warnings.push({ key: "warn.noBuyer", level: "warn" });
  if (res.guessed.includes("seller")) res.warnings.push({ key: "warn.sellerGuess", level: "info" });

  res.score = res.items.length * 10 + Object.keys(found).length + Object.keys(parties).length * 2 + (hdr ? 3 : 0);
  return res;
}

function round(v, d) {
  const p = 10 ** d;
  return Math.round((v + Number.EPSILON) * p) / p;
}
