import "./boot.js"; // diğer içe aktarmalardan önce
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@css/base.css";
import "@css/app.css";
import "./styles/dash.css";
import App from "./App.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";

createRoot(document.getElementById("root")).render(<StrictMode><ErrorBoundary root><App /></ErrorBoundary></StrictMode>);
