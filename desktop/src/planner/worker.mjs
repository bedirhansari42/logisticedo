/* Web Worker: ağır yerleştirme hesabı arayüzü dondurmasın. */
import { planAll } from "./pack.mjs";

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ results: planAll(data.items, { gap: data.gap }) });
  } catch (e) {
    self.postMessage({ error: e?.message || String(e) });
  }
};
