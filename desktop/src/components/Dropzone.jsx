import { useRef, useState } from "react";
import { ICONS } from "@common";
import { Spinner } from "./Icons.jsx";

/** Sürükle-bırak ya da tıkla seç. Eski sayfadaki .dropzone biçimini kullanır. */
export function Dropzone({ onFile, accept, compact = false, busy = false, title, sub }) {
  const [over, setOver] = useState(false);
  const input = useRef(null);
  return (
    <label
      className={`dropzone${compact ? " dropzone--compact" : ""}${over ? " is-over" : ""}${busy ? " is-busy" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); const f = e.dataTransfer?.files?.[0]; if (f) onFile(f); }}
    >
      <input ref={input} className="visually-hidden" type="file" accept={accept} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      <span className="dz-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS.upload }} />
      <span className="dz-text"><strong>{title}</strong><span>{sub}</span></span>
      <span className="dz-busy" aria-hidden="true"><Spinner /></span>
    </label>
  );
}
