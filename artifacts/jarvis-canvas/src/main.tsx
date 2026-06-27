import { createRoot } from "react-dom/client";
import App from "./App";
import { installErrorReporter } from "./lib/error-reporter";
import { setBaseUrl } from "@workspace/api-client-react";
import "./index.css";

// Direct API client at a configured backend in production. In dev (Vite proxy
// or same-origin), import.meta.env.VITE_API_URL is undefined and the client
// stays on relative paths, which Vite proxies to localhost:7860.
const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/+$/, "");
if (apiUrl) setBaseUrl(apiUrl);
console.info("[carvis] api base =", apiUrl || "(relative)");

// Install global error reporter before anything else runs.
// Unhandled exceptions and promise rejections will be POSTed to /api/errors
// so they show up in the server's pino logs instead of silently disappearing.
installErrorReporter();

createRoot(document.getElementById("root")!).render(<App />);
