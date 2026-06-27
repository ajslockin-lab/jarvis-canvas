import { createRoot } from "react-dom/client";
import App from "./App";
import { installErrorReporter } from "./lib/error-reporter";
import { setBaseUrl } from "@workspace/api-client-react";
import { API_BASE } from "./lib/api-base";
import "./index.css";

// Direct API client at a configured backend. In dev (Vite proxy or same-origin)
// the env var is undefined and the client stays on relative paths. To redirect
// the deployed backend, change HARDCODED_API (or set VITE_API_URL on Vercel) in
// src/lib/api-base.ts -- single source of truth for the API URL.
if (API_BASE) setBaseUrl(API_BASE);
console.info("[carvis] api base =", API_BASE || "(relative)");

// Install global error reporter before anything else runs.
installErrorReporter();

createRoot(document.getElementById("root")!).render(<App />);
