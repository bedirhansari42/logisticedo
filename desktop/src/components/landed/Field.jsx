/* Maliyet sayfasındaki sayı/metin hücresi: hata varsa kırmızı çerçeve. */
export function Field({ row, field, errors, onChange, label, numeric = true, ...rest }) {
  const bad = errors?.[row.id]?.[field];
  return (
    <input
      className={`input${bad ? " is-bad" : ""}`}
      inputMode={numeric ? "decimal" : undefined}
      value={row[field] ?? ""}
      onChange={(e) => onChange(row.id, { [field]: e.target.value })}
      aria-label={label}
      aria-invalid={!!bad}
      {...rest}
    />
  );
}
