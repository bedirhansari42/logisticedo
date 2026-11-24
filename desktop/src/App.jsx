import { useEffect } from "react";
import { AppProvider } from "./lib/app-context.jsx";
import { useRoute } from "./lib/router.js";
import { useLang } from "./lib/i18n.js";
import { useAutoBackup } from "./backup/scheduler.js";
import { ConfirmHost } from "./components/ConfirmHost.jsx";
import { BackupReminder } from "./components/BackupReminder.jsx";
import { UpdateNotice } from "./components/UpdateNotice.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { Dashboard } from "./pages/Dashboard.jsx";
import { Shipments } from "./pages/Shipments.jsx";
import { Proformas } from "./pages/Proformas.jsx";
import { ProformaEditor } from "./pages/ProformaEditor.jsx";
import { NewShipment } from "./pages/NewShipment.jsx";
import { Editor } from "./pages/Editor.jsx";
import { Letterheads } from "./pages/Letterheads.jsx";
import { Settings } from "./pages/Settings.jsx";
import { Planner } from "./pages/Planner.jsx";
import { Landed } from "./pages/Landed.jsx";
import { Notes } from "./pages/Notes.jsx";
import { Companies } from "./pages/Companies.jsx";
import { Banks } from "./pages/Banks.jsx";

function Pages({ route }) {
  switch (route.name) {
    case "proformas": return <Proformas />;
    case "proformaEditor": return <ProformaEditor key={route.id} id={route.id} step={route.step} />;
    case "shipments": return <Shipments />;
    case "new": return <NewShipment />;
    case "editor": return <Editor key={route.id} id={route.id} step={route.step} />;
    case "letterheads": return <Letterheads />;
    case "companies": return <Companies />;
    case "banks": return <Banks />;
    case "settings": return <Settings />;
    case "planner": return <Planner />;
    case "landed": return <Landed />;
    case "notes": return <Notes />;
    default: return <Dashboard />;
  }
}

export default function App() {
  const route = useRoute();
  const lang = useLang();
  useAutoBackup();

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
      <div className={`shell${route.name === "editor" || route.name === "proformaEditor" ? " shell--compact" : ""}`}>
        <Sidebar route={route} />
        <main className="main"><Pages route={route} /></main>
      </div>
      <ConfirmHost />
      <BackupReminder />
      <UpdateNotice />
    </AppProvider>
  );
}
