/* Metin, sayı, tarih, Incoterms ve para birimi yardımcıları (proforma okuma için). */

const MARKS = /[̀-ͯ]/g;

/* Karşılaştırma için sadeleştirme: küçük harf, aksansız, ı→i, boşluklar tek. Uzunluk değişebilir. */
export function norm(s) {
  return String(s ?? "")
    .normalize("NFKD")
    .replace(MARKS, "")
    .replace(/ı/g, "i")
    .toLowerCase()
    .replace(/[  -​ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* Karakter başına sadeleştirme: uzunluk korunur, böylece etiket eşleşmesinden sonra özgün metin kesilebilir. */
export function fold(s) {
  const str = String(s ?? "");
  let out = "";
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    let c = ch.normalize("NFKD").replace(MARKS, "");
    if (c.length !== 1) c = ch;
    c = c === "ı" ? "i" : c.toLowerCase();
    if (c.length !== 1) c = ch;
    if (c === " " || c === " ") c = " ";
    out += c;
  }
  return out;
}

/* --- Sayılar ------------------------------------------------------------------ */

const TOKEN_RE = /\d{1,3}(?:[   ']\d{3})+(?:[.,]\d+)?(?!\d)|\d[\d.,]*\d|\d/;

export function numberToken(s) {
  const m = String(s ?? "").match(TOKEN_RE);
  return m ? m[0] : null;
}

export function looksNumeric(s) {
  const t = String(s ?? "").trim();
  if (!t) return false;
  const digits = (t.match(/\d/g) || []).length;
  const letters = (t.match(/\p{L}/gu) || []).length;
  return digits > 0 && digits >= letters;
}

/** Metindeki tüm sayı parçaları (tarih biçimindekiler hariç) */
export function numberTokens(s) {
  const re = new RegExp(TOKEN_RE.source, "g");
  return [...String(s ?? "").matchAll(re)].map((m) => m[0]).filter((t) => !/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(t));
}

/** Ondalık ayırıcıyı tahmin eder ('.' ya da ','); hiç ipucu yoksa null (3 haneli gruplar binlik sayılır). */
export function detectDecimalSep(strings) {
  let dot = 0, comma = 0;
  for (const raw of strings) {
    const t = numberToken(raw);
    if (!t) continue;
    const s = t.replace(/[   ']/g, "");
    const hasDot = s.includes("."), hasComma = s.includes(",");
    if (hasDot && hasComma) {
      if (s.lastIndexOf(".") > s.lastIndexOf(",")) dot += 2; else comma += 2;
    } else if (hasDot || hasComma) {
      const ch = hasDot ? "." : ",";
      const parts = s.split(ch);
      if (parts.length > 2) { if (ch === ".") comma++; else dot++; continue; }
      const after = parts[1].length;
      if (after !== 3) { if (ch === ".") dot++; else comma++; }
    }
  }
  if (!comma && !dot) return null;
  return comma > dot ? "," : ".";
}

/** Metinden sayı çıkarır. dec: belgenin ondalık ayırıcısı ('.' ya da ','). */
export function parseNum(raw, dec = null) {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const str = String(raw).trim();
  if (!str) return null;
  const tok = numberToken(str);
  if (!tok) return null;
  let t = tok.replace(/[   ']/g, "");
  const hasDot = t.includes("."), hasComma = t.includes(",");
  let d = null;
  if (hasDot && hasComma) d = t.lastIndexOf(".") > t.lastIndexOf(",") ? "." : ",";
  else if (hasDot || hasComma) {
    const ch = hasDot ? "." : ",";
    const parts = t.split(ch);
    if (parts.length > 2) d = null;
    else if (parts[1].length === 3 && parts[0].length <= 3 && parts[0] !== "0") d = dec === ch ? ch : null;
    else d = ch;
  }
  if (d) {
    const other = d === "." ? "," : ".";
    t = t.split(other).join("").replace(d, ".");
  } else {
    t = t.replace(/[.,]/g, "");
  }
  let v = parseFloat(t);
  if (!Number.isFinite(v)) return null;
  const before = str.slice(0, str.indexOf(tok));
  if (/[-−–]\s*$/.test(before) || /^\(.*\)$/.test(str)) v = -v;
  return v;
}

/* --- Tarihler ----------------------------------------------------------------- */

const MONTHS = {
  jan: 1, january: 1, ocak: 1, januar: 1, janvier: 1, enero: 1,
  feb: 2, february: 2, subat: 2, februar: 2, fevrier: 2, febrero: 2,
  mar: 3, march: 3, mart: 3, marz: 3, mars: 3, marzo: 3,
  apr: 4, april: 4, nisan: 4, avril: 4, abril: 4,
  may: 5, mayis: 5, mai: 5, mayo: 5,
  jun: 6, june: 6, haziran: 6, juni: 6, juin: 6, junio: 6,
  jul: 7, july: 7, temmuz: 7, juli: 7, juillet: 7, julio: 7,
  aug: 8, august: 8, agustos: 8, aout: 8, agosto: 8,
  sep: 9, sept: 9, september: 9, eylul: 9, septembre: 9, septiembre: 9,
  oct: 10, october: 10, ekim: 10, oktober: 10, octobre: 10, octubre: 10, okt: 10,
  nov: 11, november: 11, kasim: 11, novembre: 11, noviembre: 11,
  dec: 12, december: 12, aralik: 12, dezember: 12, decembre: 12, diciembre: 12, dez: 12
};

function iso(y, m, d) {
  if (!(y > 1900 && y < 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseDate(v) {
  if (v instanceof Date && !isNaN(v)) return iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  const s = norm(v);
  if (!s) return null;
  let m = s.match(/\b((?:19|20)\d{2})[-./](\d{1,2})[-./](\d{1,2})\b/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/\b(\d{1,2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{4}|\d{2})\b/);
  if (m) {
    let a = +m[1], b = +m[2], y = +m[3];
    if (y < 100) y += 2000;
    let d = a, mo = b;
    if (b > 12 && a <= 12) { d = b; mo = a; }
    return iso(y, mo, d);
  }
  m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\.?\s*(?:of\s+)?([a-z]{3,9})\.?,?\s*((?:19|20)\d{2})\b/);
  if (m && MONTHS[m[2]]) return iso(+m[3], MONTHS[m[2]], +m[1]);
  m = s.match(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*((?:19|20)\d{2})\b/);
  if (m && MONTHS[m[1]]) return iso(+m[3], MONTHS[m[1]], +m[2]);
  return null;
}

/* --- Incoterms ----------------------------------------------------------------- */

export const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];

const INCO_PHRASES = [
  [/ex[\s-]?works|fabrika\s*teslim/i, "EXW"],
  [/free\s*carrier|tasiyiciya\s*teslim/i, "FCA"],
  [/free\s*alongside/i, "FAS"],
  [/free\s*on\s*board|gemide\s*teslim/i, "FOB"],
  [/cost\s*,?\s*insurance\s*(and|&)\s*freight/i, "CIF"],
  [/cost\s*(and|&)\s*freight/i, "CFR"],
  [/carriage\s*(and|&)\s*insurance\s*paid/i, "CIP"],
  [/carriage\s*paid\s*to/i, "CPT"],
  [/delivered\s*at\s*place\s*unloaded/i, "DPU"],
  [/delivered\s*at\s*place/i, "DAP"],
  [/delivered\s*duty\s*paid/i, "DDP"]
];

/** Metinde Incoterms kodu ve yerini arar. strict: yalnızca büyük harfli kodlar. */
export function findIncoterm(text, strict = false) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  const re = /(?:^|[^A-Za-z])(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP|DAT|DDU|CNF|C\s?&\s?F|C\s?\+\s?F)(?![A-Za-z])\s*[,:\-–]?\s*(.*)$/;
  let m = s.match(strict ? re : new RegExp(re.source, "i"));
  let code = null, rest = "";
  if (m) {
    code = m[1].toUpperCase().replace(/\s/g, "");
    rest = m[2] || "";
  } else if (!strict) {
    for (const [p, c] of INCO_PHRASES) {
      const mm = s.match(p);
      if (mm) { code = c; rest = s.slice(mm.index + mm[0].length); break; }
    }
  }
  if (!code) return null;
  if (code === "CNF" || code === "C&F" || code === "C+F") code = "CFR";
  let place = rest
    .replace(/\(?\s*incoterms?\s*®?\s*(20\d\d)?\s*\)?/gi, " ")
    .replace(/\b(port|limani|limanı|liman)\b/gi, " ")
    .split(/[;|]|\s{2,}|\b(?:payment|odeme|ödeme|delivery|teslim|incoterms|total|toplam)\b/i)[0]
    .replace(/^[\s,.:\-–]+|[\s,.:\-–]+$/g, "")
    .trim();
  if ((place.match(/\(/g) || []).length > (place.match(/\)/g) || []).length) place = place.slice(0, place.lastIndexOf("(")).replace(/[\s,.:\-–]+$/, "");
  if (/^\d/.test(place) || /^(usd|eur|try|gbp)\b/i.test(place)) place = "";
  if (place.length > 40) place = place.slice(0, 40).replace(/[\s,][^\s,]*$/, "");
  return { code, place };
}

/* --- Para birimi -------------------------------------------------------------- */

const CUR_TOKENS = [
  [/\b(usd|us\$|us\s*dollars?|dollars?)\b|\$/gi, "USD"],
  [/\b(eur|euro|euros)\b|€/gi, "EUR"],
  [/\b(gbp|pounds?\s*sterling)\b|£/gi, "GBP"],
  [/\b(try|tl|turkish\s*lira)\b|₺/gi, "TRY"],
  [/\b(cny|rmb|yuan)\b/gi, "CNY"],
  [/\b(rub|roubles?|rubles?)\b|₽/gi, "RUB"],
  [/\b(aed|dirhams?)\b/gi, "AED"],
  [/\b(sar|riyals?)\b/gi, "SAR"],
  [/\b(chf|swiss\s*francs?)\b/gi, "CHF"],
  [/\b(jpy|yen)\b|¥/gi, "JPY"]
];

/** Metinlerde en çok geçen para birimi kodu. */
export function detectCurrency(texts) {
  const counts = {};
  for (const t of texts) {
    const s = String(t ?? "");
    for (const [re, code] of CUR_TOKENS) {
      const n = (s.match(re) || []).length;
      if (n) counts[code] = (counts[code] || 0) + n;
    }
  }
  let best = null, max = 0;
  for (const [k, v] of Object.entries(counts)) if (v > max) { best = k; max = v; }
  return best;
}

export function currencyFromText(t) {
  return detectCurrency([t]);
}

/* --- Birim ------------------------------------------------------------------------- */

const UNIT_MAP = [
  [/^(pcs?|pieces?|piece|adet|ad|stk|stuck|pz|pza|un|unit|units|ea|each|nos?|шт)\.?$/i, "PCS"],
  [/^(sets?|takim|takım|set)\.?$/i, "SET"],
  [/^(kgs?|kilo(gram)?s?|kilogram)\.?$/i, "KG"],
  [/^(mt|m|mtr|meters?|metres?|metre)\.?$/i, "M"],
  [/^(m2|m²|sqm|sq\.?\s*m)\.?$/i, "M2"],
  [/^(m3|m³|cbm)\.?$/i, "M3"],
  [/^(l|lt|ltr|liters?|litres?|litre)\.?$/i, "L"],
  [/^(pairs?|cift|çift|prs)\.?$/i, "PAIR"],
  [/^(ctns?|cartons?|koli|kol)\.?$/i, "CTN"],
  [/^(box(es)?|kutu)\.?$/i, "BOX"],
  [/^(rolls?|rulo)\.?$/i, "ROLL"],
  [/^(tons?|tonnes?|mt\.?\s*tons?)\.?$/i, "TON"],
  [/^(pkgs?|packages?|paket|pack)\.?$/i, "PKG"],
  [/^(pallets?|palet|plt)\.?$/i, "PLT"],
  [/^(doz|dozen|duzine)\.?$/i, "DOZ"],
  [/^(bags?|cuval|çuval|torba)\.?$/i, "BAG"]
];

export function normUnit(s) {
  const t = String(s ?? "").trim();
  if (!t) return "";
  const n = norm(t).replace(/[()]/g, "").trim();
  for (const [re, u] of UNIT_MAP) if (re.test(n)) return u;
  return t.length <= 8 ? t.toUpperCase() : "";
}

export function unitFromQtyText(s) {
  const m = String(s ?? "").match(/\d[\d.,\s]*\s*([A-Za-zÇĞİÖŞÜçğıöşü²³.]{1,8})\s*$/);
  return m ? normUnit(m[1]) : "";
}

const PKG_TYPES = [
  [/cartons?|ctns?|koli/i, "CARTONS"],
  [/pallets?|palet|plt/i, "PALLETS"],
  [/boxes|box|kutu/i, "BOXES"],
  [/crates?|kafes|sandik|sandık/i, "CRATES"],
  [/bags?|cuval|çuval|torba/i, "BAGS"],
  [/bales?|balya/i, "BALES"],
  [/drums?|varil/i, "DRUMS"],
  [/rolls?|rulo/i, "ROLLS"],
  [/bundles?|demet/i, "BUNDLES"],
  [/cases?/i, "CASES"]
];

export function pkgTypeFromText(s) {
  const t = String(s ?? "");
  for (const [re, v] of PKG_TYPES) if (re.test(t)) return v;
  return "";
}

/* --- HS kodu --------------------------------------------------------------------- */

export function cleanHs(s) {
  const m = String(s ?? "").match(/\b\d{4}(?:[.\s]?\d{2}){1,3}\b|\b\d{4}\b/);
  return m ? m[0].replace(/\s+/g, ".") : "";
}

export function hsFromText(s) {
  const m = String(s ?? "").match(/\b(?:hs|h\.s\.|gtip|g\.t\.i\.p\.?|tariff)\s*(?:code|no|kodu)?\s*[:.]?\s*(\d{4}(?:[.\s]?\d{2}){1,3})/i);
  return m ? m[1].replace(/\s+/g, ".") : "";
}

/* --- Taşıma şekli --------------------------------------------------------------- */

export function transportFromText(s) {
  const n = norm(s);
  if (!n) return "";
  const hits = [];
  if (/\b(sea|ocean|vessel|deniz|gemi|seefracht|maritime|maritimo|fcl|lcl)\b/.test(n)) hits.push("BY SEA");
  if (/\b(air|hava|ucak|flight|luft|aerien|aereo)\b/.test(n)) hits.push("BY AIR");
  if (/\b(road|truck|tir|kara|lkw|camion|trailer|karayolu)\b/.test(n)) hits.push("BY ROAD");
  if (/\b(rail|train|demir|tren|bahn|railway)\b/.test(n)) hits.push("BY RAIL");
  if (/\b(courier|express|dhl|ups|fedex|tnt|kurye)\b/.test(n)) hits.push("COURIER");
  if (hits.length > 1) return "MULTIMODAL";
  return hits[0] || "";
}
