/* Ağır kütüphaneleri yalnızca gerektiğinde yükler. Hepsi projenin vendor/ klasöründen gelir. */

// React uygulaması (Vite) kök adresi globalThis.__LGX_BASE__ ile verir; eski statik sayfa boş bırakır.
const BASE = globalThis.__LGX_BASE__ || null;
const rel = (p) => new URL(p, import.meta.url).href;
const VENDOR = BASE ? BASE + "vendor/" : rel("../../../vendor/");
const scripts = new Map();

function loadScript(file) {
  const src = VENDOR + file;
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = false;
      s.onload = () => resolve();
      s.onerror = () => { scripts.delete(src); reject(new Error(`Kütüphane yüklenemedi: ${file}`)); };
      document.head.append(s);
    }));
  }
  return scripts.get(src);
}

let pdfjsPromise;
export function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(/* @vite-ignore */ VENDOR + "pdfjs/pdf.min.mjs").then((m) => {
      m.GlobalWorkerOptions.workerSrc = VENDOR + "pdfjs/pdf.worker.min.mjs";
      return m;
    }).catch((e) => { pdfjsPromise = null; throw e; });
  }
  return pdfjsPromise;
}

export const PDFJS_OPTS = {
  cMapUrl: VENDOR + "pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: VENDOR + "pdfjs/standard_fonts/",
  isEvalSupported: false,
  useSystemFonts: true
};

export async function loadPdfLib() {
  await loadScript("pdf-lib.min.js");
  await loadScript("fontkit.min.js");
  return { PDFLib: window.PDFLib, fontkit: window.fontkit };
}

export async function loadJSZip() {
  await loadScript("jszip.min.js");
  return window.JSZip;
}

export async function loadDocxPreview() {
  await loadScript("jszip.min.js");
  await loadScript("docx-preview.min.js");
  return window.docx;
}

export async function loadHtmlToImage() {
  await loadScript("html-to-image.min.js");
  return window.htmlToImage;
}

export async function loadExcelJS() {
  await loadScript("exceljs.min.js");
  return window.ExcelJS;
}

export async function loadSheetJS() {
  await loadScript("xlsx.full.min.js");
  return window.XLSX;
}

/* Fontlar: PDF çıktısı için IBM Plex Sans (Türkçe karakter desteği) */
let fontsPromise;
export function loadDocFonts() {
  if (!fontsPromise) {
    const base = BASE ? BASE + "assets/fonts/" : rel("../../fonts/");
    fontsPromise = Promise.all(["Regular", "SemiBold", "Bold"].map((w) =>
      fetch(base + `IBMPlexSans-${w}.ttf`).then((r) => {
        if (!r.ok) throw new Error(`Font yüklenemedi (${w})`);
        return r.arrayBuffer();
      })
    )).catch((e) => { fontsPromise = null; throw e; });
  }
  return fontsPromise;
}
