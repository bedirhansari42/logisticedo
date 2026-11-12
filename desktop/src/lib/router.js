/* Küçük hash yönlendirici: #/  #/shipments  #/new  #/s/:id/:step  #/letterheads  #/planner  #/settings */
import { useEffect, useState } from "react";

export function parseHash(hash) {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [a, b, c] = parts;
  if (!a) return { name: "dashboard" };
  if (a === "shipments") return { name: "shipments" };
  if (a === "new") return { name: "new" };
  if (a === "letterheads") return { name: "letterheads" };
  if (a === "settings") return { name: "settings" };
  if (a === "planner") return { name: "planner" };
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
