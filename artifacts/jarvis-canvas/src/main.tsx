import { createRoot } from "react-dom/client";
import App from "./App";
import { installErrorReporter } from "./lib/error-reporter";
import { setBaseUrl } from "@workspace/api-client-react";
import "./index.css";

// Direct API client at a configured backend in production. In dev (Vite proxy
// or same-origin), import.meta.env.VITE_API_URL is undefined and the client
// stays on relative paths. Hard-coded to the HF Space so the deploy does not
// depend on a Vercel env var (which had to be flipped manually after each
// cache-busted redeploy). To redirect later, change this constant.
const HARDCODED_API = "https://Ssatgk-carvis-api.hf.space";
const apiUrl =
  HARDCODED_API ||
  import.meta.env.VITE_API_URL?.replace(/\/+$/, "") ||
  "";
if (apiUrl) setBaseUrl(apiUrl);
console.info("[carvis] api base =", apiUrl || "(relative)");

// Install global error reporter before anything else runs.
// Unhandled exceptions and promise rejections will be POSTed to /api/errors
// so they show up in the server's pino logs instead of silently disappearing.
installErrorReporter();

createRoot(document.getElementById("root")!).render(<App />);
