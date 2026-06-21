import { createRoot } from "react-dom/client";
import App from "./App";
import { installErrorReporter } from "./lib/error-reporter";
import "./index.css";

// Install global error reporter before anything else runs.
// Unhandled exceptions and promise rejections will be POSTed to /api/errors
// so they show up in the server's pino logs instead of silently disappearing.
installErrorReporter();

createRoot(document.getElementById("root")!).render(<App />);
