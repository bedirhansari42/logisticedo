/* Hazır listeli alan: yalnızca listeden seçilir ya da boş bırakılır (serbest yazma yok).
   Proformadan okunan ve listede olmayan bir değer silinmesin diye seçenek olarak korunur.
   Listesi olmayan alanlar düz metin kutusu olarak kalır. */
import { COUNTRIES, resolveCountry } from "./countries.js";

export const LISTS = {
  "dl-country": COUNTRIES,
  "dl-currency": ["USD", "EUR", "GBP", "TRY", "CNY", "RUB", "AED", "SAR", "CHF", "JPY"],
  "dl-unit": ["PCS", "SET", "KG", "M", "M2", "M3", "L", "PAIR", "BOX", "CTN", "ROLL", "TON", "PKG", "DOZ", "BAG"],
  "dl-pkg": ["CARTONS", "PALLETS", "BOXES", "CRATES", "BAGS", "BALES", "DRUMS", "ROLLS", "BUNDLES", "CASES", "PIECES"],
  "dl-cov": ["ICC (A) - ALL RISKS", "ICC (B)", "ICC (C)", "OPEN COVER / ANNUAL POLICY"]
};

// listede olmayan ama tanınan değerler (ör. "Turkey") listedeki karşılığıyla gösterilir; kayıtlı değer ancak kullanıcı seçerse değişir
const RESOLVERS = { "dl-country": resolveCountry };

export function ListInput({ list, value, placeholder, className, type, inputMode, maxLength, autoCapitalize, spellCheck, ...props }) {
  const options = LISTS[list];
  if (!options) return <input value={value} placeholder={placeholder} className={className} type={type} inputMode={inputMode} maxLength={maxLength} autoCapitalize={autoCapitalize} spellCheck={spellCheck} {...props} />;
  const raw = value ?? "";
  const v = (raw !== "" && !options.includes(raw) && RESOLVERS[list]?.(raw)) || raw;
  const cls = (className || "").split(/\s+/).map((c) => (c === "input" ? "select" : c)).filter(Boolean).join(" ");
  return (
    <select value={v} className={cls} {...props}>
      <option value="">{placeholder || "—"}</option>
      {v !== "" && !options.includes(v) && <option value={v}>{v}</option>}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
