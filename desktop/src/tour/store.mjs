/* Tanıtım durumunun kalıcı deposu (bu bilgisayara özgü, localStorage `lgx.tour`). `useSyncExternalStore(subscribeTour, getTour)` ile okunur.
   Depolama kullanılamıyorsa (engelli/bozuk) tanıtım bellekte çalışır; hiçbir çağrı fırlatmaz. */
import { initialState, parseState, reduce } from "./model.mjs";

export const TOUR_KEY = "lgx.tour";

const listeners = new Set();
let cache = { raw: undefined, state: initialState() }; // ham metin değişmedikçe aynı nesne döner
let mem = null;      // son yazılan durum (depolama yazılamazsa tek doğru kaynak)
let memOnly = false; // yazma başarısızsa true

export function getTour() {
  if (memOnly) return mem;
  let raw;
  try { raw = globalThis.localStorage?.getItem(TOUR_KEY) ?? null; } catch { return mem || (mem = initialState()); }
  if (raw !== cache.raw) cache = { raw, state: parseState(raw) };
  return cache.state;
}

export function setTourState(state) {
  const next = parseState(state);
  mem = next;
  try {
    globalThis.localStorage?.setItem(TOUR_KEY, JSON.stringify(next));
    memOnly = false;
  } catch { memOnly = true; }
  listeners.forEach((fn) => fn());
}

/** Olayı uygular; durum değişmiyorsa (olay uymuyorsa) yazmaz ve haber vermez. */
export function tourEvent(event) {
  const cur = getTour();
  const next = reduce(cur, event);
  if (next === cur) return;
  setTourState(next);
}

export function subscribeTour(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
