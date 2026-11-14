/* Küçük hash yönlendirici: #/  #/shipments  #/new  #/s/:id/:step  #/proformas  #/pf/:id/:step  #/letterheads  #/companies  #/banks  #/planner  #/landed  #/notes  #/settings */
import { useEffect, useState } from "react";

export function parseHash(hash) {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [a, b, c] = parts;
  if (!a) return { name: "dashboard" };
  if (a === "shipments") return { name: "shipments" };
  if (a === "new") return { name: "new" };
  if (a === "letterheads") return { name: "letterheads" };
  if (a === "companies") return { name: "companies" };
  if (a === "banks") return { name: "banks" };
  if (a === "settings") return { name: "settings" };
  if (a === "planner") return { name: "planner" };
  if (a === "landed") return { name: "landed" };
  if (a === "notes") return { name: "notes" };
  if (a === "proformas") return { name: "proformas" };
  if (a === "pf" && b) return { name: "proformaEditor", id: b, step: c || "general" };
  if (a === "s" && b) return { name: "editor", id: b, step: c || "general" };
  return { name: "dashboard" };
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export const go = (path) => { location.hash = path.startsWith("#") ? path : `#${path}`; };
export const href = (path) => `#${path}`;
