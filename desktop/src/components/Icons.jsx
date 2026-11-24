import { ICONS } from "@common";

const P = {
  company: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M3.5 17.5v-13a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v13M11.5 8.5h4a1 1 0 0 1 1 1v8M2.5 17.5h15"/><path d="M6.5 6.5h2M6.5 9.5h2M6.5 12.5h2"/></svg>',
  bank: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M2.5 8 10 3l7.5 5M4 8v7.5M8 8v7.5M12 8v7.5M16 8v7.5M2.5 17h15"/></svg>',
  dashboard: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="2.5" width="6" height="7.5" rx="1.5"/><rect x="11.5" y="2.5" width="6" height="4.5" rx="1.5"/><rect x="2.5" y="13" width="6" height="4.5" rx="1.5"/><rect x="11.5" y="10" width="6" height="7.5" rx="1.5"/></svg>',
  shipments: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M2.5 5.5 10 2l7.5 3.5v9L10 18l-7.5-3.5v-9Z"/><path d="M2.5 5.5 10 9l7.5-3.5M10 9v9"/></svg>',
  planner: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><rect x="2" y="5" width="16" height="10" rx="1.5"/><path d="M6 5v10M10 5v10M14 5v10M2 9h4M10 11h4"/></svg>',
  landed: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="2.5" width="13" height="15" rx="2"/><path d="M6.5 6h7M6.5 9.5h2M11.5 9.5h2M6.5 12.5h2M11.5 12.5h2M6.5 15h2M11.5 15h2"/></svg>',
  sun: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="3.5"/><path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3 6 14M14 6l1.3-1.3"/></svg>',
  moon: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M16.5 11.6A6.6 6.6 0 0 1 8.4 3.5a6.6 6.6 0 1 0 8.1 8.1Z"/></svg>',
  notes: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><rect x="2.5" y="3" width="4.5" height="14" rx="1.2"/><rect x="8" y="3" width="4.5" height="9" rx="1.2"/><rect x="13.5" y="3" width="4" height="11.5" rx="1.2"/></svg>',
  calendar: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12.5" rx="2"/><path d="M3 8.5h14M7 2.8v3.4M13 2.8v3.4"/></svg>',
  arrowUp: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5"/></svg>',
  arrowDown: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v10M3.5 8.5 8 13l4.5-4.5"/></svg>',
  gear: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="2.6"/><path d="M8.6 2.6h2.8l.5 2.1a5.6 5.6 0 0 1 1.3.75l2.05-.65 1.4 2.43-1.55 1.5a5.6 5.6 0 0 1 0 1.5l1.55 1.5-1.4 2.43-2.05-.65a5.6 5.6 0 0 1-1.3.75l-.5 2.1H8.6l-.5-2.1a5.6 5.6 0 0 1-1.3-.75l-2.05.65-1.4-2.43 1.55-1.5a5.6 5.6 0 0 1 0-1.5L3.35 7.23l1.4-2.43 2.05.65a5.6 5.6 0 0 1 1.3-.75l.5-2.1Z"/></svg>',
  plus: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>',
  proforma: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M5 2.5h7l3.5 3.5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z"/><path d="M12 2.5V6h3.5M7 10h6M7 13h4"/></svg>',
  letterhead: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><rect x="4" y="2.5" width="12" height="15" rx="2"/><path d="M7 6h6M7 9h6"/></svg>',
  settings: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M3 6h7M14 6h3M3 14h3M10 14h7"/><circle cx="12" cy="6" r="2"/><circle cx="8" cy="14" r="2"/></svg>',
  search: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5"/><path d="m13.2 13.2 3.8 3.8"/></svg>',
  back: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>',
  chevron: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>',
  more: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3.5" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="12.5" cy="8" r="1.3"/></svg>',
  expand: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><path d="M17.5 6.5h.01"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>',
  github: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>',
  close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg>'
};

export function Icon({ name, className = "" }) {
  return <span className={`ico ${className}`.trim()} aria-hidden="true" dangerouslySetInnerHTML={{ __html: P[name] || ICONS[name] || "" }} />;
}

export function Spinner() { return <span className="spinner" />; }

export function Brand({ compact = false }) {
  return (
    <a className="brand" href="#/" aria-label="logisticedo">
      <svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="bg1" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#00827c" /><stop offset="1" stopColor="#cbfffc" /></linearGradient></defs><rect width="32" height="32" rx="8" fill="#2b3034" /><path d="M8 22c3.2-7.4 8.8-11.2 16-11.8" fill="none" stroke="url(#bg1)" strokeWidth="2.4" strokeLinecap="round" /><circle cx="8" cy="22" r="2.8" fill="#cbfffc" /><circle cx="24" cy="10.2" r="2.8" fill="#00827c" stroke="#cbfffc" strokeWidth="1.4" /></svg>
      {!compact && <span>logistic<b>edo</b></span>}
    </a>
  );
}
