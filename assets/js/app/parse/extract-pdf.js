/* PDF → satırlar. pdf.js metin katmanını konumlarıyla okur, satırlara ve hücrelere ayırır.
   Satır: { kind:'pdf', group:'pdf', page, y, h, cells:[{text,x0,x1}], words:[{text,x0,x1}] } */
import { loadPdfJs, PDFJS_OPTS } from "../loader.js";

const MAX_PAGES = 20;

export async function extractPdf(buffer) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ ...PDFJS_OPTS, data: new Uint8Array(buffer.slice(0)) }).promise;
  const rows = [];
  let chars = 0;
  try {
    const pages = Math.min(doc.numPages, MAX_PAGES);
    for (let p = 1; p <= pages; p++) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      const items = [];
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const tr = pdfjs.Util.transform(vp.transform, it.transform);
        const a = tr[0], b = tr[1];
        if (Math.abs(b) > Math.abs(a) * 0.3) continue; // dikey/döndürülmüş metni atla
        const size = Math.hypot(tr[2], tr[3]) || Math.hypot(a, b) || 10;
        const width = it.width * (vp.scale || 1) || it.str.length * size * 0.5;
        items.push({ str: it.str, x: tr[4], y: tr[5], w: width, h: size });
        chars += it.str.trim().length;
      }
      rows.push(...groupLines(items, p));
      page.cleanup();
    }
    return { rows, chars, pages: doc.numPages };
  } finally {
    doc.destroy();
  }
}

function groupLines(items, page) {
  items.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const it of items) {
    const line = lines.length ? lines[lines.length - 1] : null;
    if (line && Math.abs(it.y - line.y) <= Math.max(2, 0.45 * Math.min(it.h, line.h))) {
      line.items.push(it);
      line.h = Math.max(line.h, it.h);
    } else {
      lines.push({ y: it.y, h: it.h, items: [it] });
    }
  }
  return lines.map((l) => buildRow(l, page)).filter((r) => r.cells.length);
}

function buildRow(line, page) {
  const items = line.items.sort((a, b) => a.x - b.x);
  // 1) Kelimeler (öğe içindeki boşluklara göre, karakter genişliği oranıyla)
  const raw = [];
  for (const it of items) {
    const cw = it.w / Math.max(1, it.str.length);
    const re = /\S+/g;
    let m;
    while ((m = re.exec(it.str))) {
      raw.push({ text: m[0], x0: it.x + m.index * cw, x1: it.x + (m.index + m[0].length) * cw, h: it.h });
    }
  }
  raw.sort((a, b) => a.x0 - b.x0);
  // 2) Harf harf yazılmış PDF'ler için bitişik parçaları birleştir
  const words = [];
  for (const w of raw) {
    const prev = words[words.length - 1];
    if (prev && w.x0 - prev.x1 < 0.12 * w.h) {
      prev.text += w.text;
      prev.x1 = Math.max(prev.x1, w.x1);
    } else {
      words.push({ ...w });
    }
  }
  // 3) Büyük boşluklara göre hücreler
  const cells = [];
  for (const w of words) {
    const cur = cells[cells.length - 1];
    if (cur && w.x0 - cur.x1 <= Math.max(4, 0.65 * w.h)) {
      cur.text += " " + w.text;
      cur.x1 = Math.max(cur.x1, w.x1);
    } else {
      cells.push({ text: w.text, x0: w.x0, x1: w.x1 });
    }
  }
  return { kind: "pdf", group: "pdf", page, y: line.y + (page - 1) * 10000, h: line.h, cells, words };
}
