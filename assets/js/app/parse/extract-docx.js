/* Word (.docx) → satırlar. Paragraflar tek hücreli (sekmeyle bölünmüşse çok hücreli) satırlar,
   tablolar ise ızgara sütun indeksli satırlar olarak çıkar. Üst/alt bilgi ve metin kutuları da okunur. */
import { loadJSZip } from "../loader.js";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export async function extractDocx(buffer) {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.keys(zip.files);
  const rows = [];
  const state = { tbl: 0, para: 0 };

  const parse = async (path) => {
    const f = zip.file(path);
    if (!f) return null;
    const xml = await f.async("string");
    return new DOMParser().parseFromString(xml, "application/xml");
  };

  for (const h of files.filter((n) => /^word\/header\d*\.xml$/.test(n)).sort()) {
    const doc = await parse(h);
    if (doc) walk(doc.documentElement, rows, state);
  }
  const main = await parse("word/document.xml");
  if (!main) throw new Error("document.xml bulunamadı");
  const body = main.getElementsByTagNameNS(W, "body")[0];
  if (body) walk(body, rows, state);
  for (const f of files.filter((n) => /^word\/footer\d*\.xml$/.test(n)).sort()) {
    const doc = await parse(f);
    if (doc) walk(doc.documentElement, rows, state);
  }
  return rows.map((r, i) => ({ ...r, y: i }));
}

function walk(container, rows, state) {
  for (const el of Array.from(container.children)) {
    const ln = el.localName;
    if (ln === "p") pushParagraph(el, rows, state);
    else if (ln === "tbl") pushTable(el, rows, state);
    else if (ln === "sdt") {
      const c = child(el, "sdtContent");
      if (c) walk(c, rows, state);
    } else if (ln === "customXml" || ln === "smartTag" || ln === "ins") {
      walk(el, rows, state);
    }
  }
}

function child(el, name) {
  for (const c of Array.from(el.children)) if (c.localName === name) return c;
  return null;
}

/* Paragraf metni; metin kutuları (txbxContent) ayrıca toplanır, silinmiş metin ve alan kodları atlanır. */
function paraText(p, boxes) {
  let out = "";
  const visit = (node) => {
    for (const n of Array.from(node.children)) {
      const ln = n.localName;
      if (ln === "txbxContent") { boxes.push(n); continue; }
      if (ln === "Fallback" || ln === "del" || ln === "instrText" || ln === "delText") continue;
      if (ln === "t") out += n.textContent;
      else if (ln === "tab" || ln === "ptab") out += "\t";
      else if (ln === "br" || ln === "cr") out += "\n";
      else if (ln === "noBreakHyphen") out += "-";
      else visit(n);
    }
  };
  visit(p);
  return out;
}

function pushParagraph(p, rows, state) {
  const boxes = [];
  const text = paraText(p, boxes);
  if (text.trim()) {
    const parts = text.split("\t");
    const cells = [];
    parts.forEach((part, i) => {
      const t = part.replace(/\s+\n/g, "\n").trim();
      if (t) cells.push({ text: t, x0: i * 10, x1: i * 10 + 10 });
    });
    if (cells.length) rows.push({ kind: "grid", group: "body", page: 0, h: 1, cells });
  }
  for (const box of boxes) walk(box, rows, state);
}

function pushTable(tbl, rows, state) {
  const group = "tbl" + (state.tbl++);
  const nested = [];
  for (const tr of Array.from(tbl.children).filter((c) => c.localName === "tr")) {
    let col = 0;
    const trPr = child(tr, "trPr");
    const before = trPr && child(trPr, "gridBefore");
    if (before) col += parseInt(before.getAttributeNS(W, "val") || before.getAttribute("w:val") || "0", 10) || 0;
    const cells = [];
    for (const tc of Array.from(tr.children).filter((c) => c.localName === "tc")) {
      const tcPr = child(tc, "tcPr");
      let span = 1;
      let vCont = false;
      if (tcPr) {
        const gs = child(tcPr, "gridSpan");
        if (gs) span = parseInt(gs.getAttributeNS(W, "val") || gs.getAttribute("w:val") || "1", 10) || 1;
        const vm = child(tcPr, "vMerge");
        if (vm) {
          const v = vm.getAttributeNS(W, "val") || vm.getAttribute("w:val");
          vCont = !v || v === "continue";
        }
      }
      const parts = [];
      for (const c of Array.from(tc.children)) {
        if (c.localName === "p") {
          const boxes = [];
          const t = paraText(c, boxes).replace(/\t+/g, " ").trim();
          if (t) parts.push(t);
          boxes.forEach((b) => nested.push(b));
        } else if (c.localName === "tbl") {
          nested.push(c);
        } else if (c.localName === "sdt") {
          const sc = child(c, "sdtContent");
          if (sc) for (const p of Array.from(sc.children).filter((x) => x.localName === "p")) {
            const t = paraText(p, []).trim();
            if (t) parts.push(t);
          }
        }
      }
      const text = vCont ? "" : parts.join("\n").trim();
      if (text) cells.push({ text, x0: col, x1: col + span });
      col += span;
    }
    rows.push({ kind: "grid", group, page: 0, h: 1, cells });
  }
  for (const n of nested) {
    if (n.localName === "tbl") pushTable(n, rows, state);
    else walk(n, rows, state);
  }
}
