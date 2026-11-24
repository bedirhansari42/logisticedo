/* İlk açılış tanıtımının mantığı (DOM'suz, testli). Durum: new → welcome → setup → pages → done.
   Kalıcılık `store.mjs`'te; burada yalnızca geçişler, kurulum durumu ve otomatik başlangıç kararı var. */

export const SETUP_STEPS = ["letterhead", "company", "bank"];
export const PAGE_STEPS = ["proformas", "shipments", "planner", "landed", "notes"];
const STATUSES = ["new", "welcome", "setup", "pages", "done"];

export const pageRoute = (id) => `/${id}`;

/** Banka hesabı bir şirkete bağlıdır: şirket yokken banka satırı Şirketler sayfasına gider. */
export function setupRoute(id, { companies }) {
  if (id === "letterhead") return "/letterheads";
  if (id === "bank" && companies > 0) return "/banks";
  return "/companies";
}

export const initialState = () => ({ status: "new", page: 0 });

/** Kayıttan durum okur (JSON metni ya da nesne); geçersiz her şey "new" sayılır, sayfa 0..4'e sıkıştırılır. */
export function parseState(raw) {
  let v = raw;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return initialState(); } }
  if (!v || typeof v !== "object" || Array.isArray(v) || !STATUSES.includes(v.status)) return initialState();
  const n = Math.floor(Number(v.page));
  const page = Number.isFinite(n) ? Math.min(Math.max(n, 0), PAGE_STEPS.length - 1) : 0;
  return { status: v.status, page };
}

/** banks: tüm şirketlerdeki banka hesabı sayısı toplamı. */
export function setupStatus({ letterheads, companies, banks }) {
  const letterhead = letterheads > 0, company = companies > 0, bank = banks > 0;
  return { letterhead, company, bank, complete: letterhead && company && bank };
}

/** none: karışma | wait: veriler yüklenene kadar bekle | markDone: eski kullanıcı, sessizce bitir | start: karşılamayı aç */
export function autoStartDecision({ state, ready, hasData }) {
  if (state.status !== "new") return "none";
  if (!ready) return "wait";
  return hasData ? "markDone" : "start";
}

export function reduce(state, event) {
  const { status, page } = state;
  if (event === "close") return status === "new" ? state : { status: "done", page: 0 };
  if (event === "restart") return { status: "welcome", page: 0 };
  if (event === "start" && status === "welcome") return { status: "setup", page: 0 };
  if ((event === "skipSetup" || event === "finishSetup") && status === "setup") return { status: "pages", page: 0 };
  if (status === "pages" && event === "next") return page >= PAGE_STEPS.length - 1 ? { status: "done", page: 0 } : { status: "pages", page: page + 1 };
  if (status === "pages" && event === "back") return { status: "pages", page: Math.max(0, page - 1) };
  return state;
}
