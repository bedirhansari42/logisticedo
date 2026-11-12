/* PDF baytlarını pdf.js ile tuval(ler)e çizer. Önizleme, indirilen dosyanın kendisidir. */
import { loadPdfJs, PDFJS_OPTS } from "./loader.js";
import { previewWatermark } from "./access.js";

let token = 0;

/** Önizleme tuvaline soluk, döşeli çapraz filigran çizer (yalnızca ekran; PDF dosyasına girmez) */
function drawWatermark(canvas) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  const size = Math.round(w * 0.045);
  ctx.save();
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = "#1c2326";
  ctx.font = `700 ${size}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 6);
  const text = "PREVIEW · logisticedo.com";
  const stepX = ctx.measureText(text).width + size * 3, stepY = size * 5;
  const reach = Math.hypot(w, h);
  for (let y = -reach, row = 0; y < reach; y += stepY, row++) {
    for (let x = -reach + (row % 2 ? stepX / 2 : 0); x < reach; x += stepX) ctx.fillText(text, x, y);
  }
  ctx.restore();
}

export async function renderPdfInto(container, bytes, zoom = 1) {
  const my = ++token;
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ ...PDFJS_OPTS, data: bytes.slice(0) }).promise;
  try {
    // Taban genişlik: kaydırma alanının iç genişliği (yakınlaştırılmış sayfalar bunu etkilemesin)
    const host = container.parentElement;
    const hs = getComputedStyle(host);
    const base = host.clientWidth - parseFloat(hs.paddingLeft) - parseFloat(hs.paddingRight);
    const width = Math.max(240, base) * zoom;
    // Çok büyütülünce tuval çok devasa olmasın
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2.5, 4096 / width));
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= doc.numPages; i++) {
      if (my !== token) return null;
      const page = await doc.getPage(i);
      const vp1 = page.getViewport({ scale: 1 });
      const scale = width / vp1.width;
      const vp = page.getViewport({ scale: scale * dpr });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${Math.round(vp1.height * scale)}px`;
      canvas.className = "pv-page";
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      if (previewWatermark()) drawWatermark(canvas);
      frag.append(canvas);
    }
    if (my !== token) return null;
    container.replaceChildren(frag);
    return doc.numPages;
  } finally {
    doc.destroy();
  }
}

/** Antet ayar penceresi için PDF'in ilk sayfasını görsele çevirir */
export async function pdfFirstPageToCanvas(bytes, targetWidth) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ ...PDFJS_OPTS, data: bytes.slice(0) }).promise;
  try {
    const page = await doc.getPage(1);
    const vp1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: targetWidth / vp1.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    return canvas;
  } finally {
    doc.destroy();
  }
}
