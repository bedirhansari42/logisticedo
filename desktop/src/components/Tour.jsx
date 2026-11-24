import { useEffect, useSyncExternalStore } from "react";
import { useApp } from "../lib/app-context.jsx";
import { getTour, subscribeTour, setTourState } from "../tour/store.mjs";
import { autoStartDecision } from "../tour/model.mjs";
import { TourWelcome } from "./TourWelcome.jsx";
import { TourCard } from "./TourCard.jsx";

const FIRST_MS = 1500;
const RETRY_MS = 5000;

/** İlk açılış tanıtımının ana bileşeni. Karar mantığı tour/model.mjs'te: yalnızca yeni kurulumda (hiç veri yok) karşılama açılır,
    verisi olan kullanıcıda sessizce bitirilir. Başka bir pencere açıksa (ör. güncelleme bildirimi) kapanana kadar bekler. */
export function Tour() {
  const state = useSyncExternalStore(subscribeTour, getTour);
  const { ready, shipments, proformas, letterheads, companies } = useApp();
  const hasData = shipments.length + proformas.length + letterheads.length + companies.length > 0;

  useEffect(() => {
    const decision = autoStartDecision({ state, ready, hasData });
    if (decision === "markDone") { setTourState({ status: "done", page: 0 }); return; }
    if (decision !== "start") return;
    let id;
    const tick = () => {
      if (document.querySelector("dialog[open]")) { id = setTimeout(tick, RETRY_MS); return; }
      setTourState({ status: "welcome", page: 0 });
    };
    id = setTimeout(tick, FIRST_MS);
    return () => clearTimeout(id);
  }, [state, ready, hasData]);

  if (state.status === "welcome") return <TourWelcome />;
  if (state.status === "setup" || state.status === "pages") return <TourCard state={state} />;
  return null;
}
