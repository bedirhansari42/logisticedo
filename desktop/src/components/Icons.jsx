import { ICONS } from "@common";

const P = {
  dashboard: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="2.5" width="6" height="7.5" rx="1.5"/><rect x="11.5" y="2.5" width="6" height="4.5" rx="1.5"/><rect x="2.5" y="13" width="6" height="4.5" rx="1.5"/><rect x="11.5" y="10" width="6" height="7.5" rx="1.5"/></svg>',
  shipments: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M2.5 5.5 10 2l7.5 3.5v9L10 18l-7.5-3.5v-9Z"/><path d="M2.5 5.5 10 9l7.5-3.5M10 9v9"/></svg>',
  planner: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><rect x="2" y="5" width="16" height="10" rx="1.5"/><path d="M6 5v10M10 5v10M14 5v10M2 9h4M10 11h4"/></svg>',
  plus: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>',
  letterhead: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><rect x="4" y="2.5" width="12" height="15" rx="2"/><path d="M7 6h6M7 9h6"/></svg>',
  settings: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M3 6h7M14 6h3M3 14h3M10 14h7"/><circle cx="12" cy="6" r="2"/><circle cx="8" cy="14" r="2"/></svg>',
  search: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5"/><path d="m13.2 13.2 3.8 3.8"/></svg>',
  back: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>',
  chevron: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>',
  more: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3.5" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="12.5" cy="8" r="1.3"/></svg>',
  expand: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg>',
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
