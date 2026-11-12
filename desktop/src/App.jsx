import { useEffect } from "react";
import { AppProvider } from "./lib/app-context.jsx";
import { useRoute } from "./lib/router.js";
import { useLang } from "./lib/i18n.js";
import { Sidebar } from "./components/Sidebar.jsx";
import { Dashboard } from "./pages/Dashboard.jsx";
import { Shipments } from "./pages/Shipments.jsx";
import { NewShipment } from "./pages/NewShipment.jsx";
import { Editor } from "./pages/Editor.jsx";
import { Letterheads } from "./pages/Letterheads.jsx";
import { Settings } from "./pages/Settings.jsx";
import { Planner } from "./pages/Planner.jsx";
import { Companies } from "./pages/Companies.jsx";
import { Banks } from "./pages/Banks.jsx";

function Pages({ route }) {
  switch (route.name) {
    case "shipments": return <Shipments />;
    case "new": return <NewShipment />;
    case "editor": return <Editor key={route.id} id={route.id} step={route.step} />;
    case "letterheads": return <Letterheads />;
    case "companies": return <Companies />;
    case "banks": return <Banks />;
    case "settings": return <Settings />;
    case "planner": return <Planner />;
    default: return <Dashboard />;
  }
}

export default function App() {
  const route = useRoute();
  const lang = useLang();

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  // Pencere dışına bırakılan dosyalar uygulamayı başka sayfaya götürmesin
  useEffect(() => {
    const stop = (e) => e.preventDefault();
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => { window.removeEventListener("dragover", stop); window.removeEventListener("drop", stop); };
  }, []);

  return (
    <AppProvider>
      <div className={`shell${route.name === "editor" ? " shell--compact" : ""}`}>
        <Sidebar route={route} />
        <main className="main"><Pages route={route} /></main>
      </div>
    </AppProvider>
  );
}
