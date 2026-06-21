// Client-side error reporting.
// Catches unhandled exceptions and unhandled promise rejections,
// POSTs them to /api/errors so they show up in the server's pino logs.
// This gives us visibility into browser crashes we'd otherwise never see.

const API_BASE = import.meta.env.VITE_API_URL || "";

async function reportError(payload: {
  message: string;
  stack?: string;
  url?: string;
  line?: number;
  col?: number;
  userAgent?: string;
}) {
  try {
    await fetch(`${API_BASE}/api/errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // fire-and-forget: don't let a failed report cause more errors
      keepalive: true,
    });
  } catch {
    // truly silent — reporting the reporter would be silly
  }
}

export function installErrorReporter() {
  window.addEventListener("error", (e) => {
    void reportError({
      message: e.message || String(e.error?.message || "Unknown error"),
      stack: e.error?.stack?.slice(0, 2000),
      url: e.filename,
      line: e.lineno,
      col: e.colno,
      userAgent: navigator.userAgent,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    void reportError({
      message: reason?.message || String(reason) || "Unhandled promise rejection",
      stack: reason?.stack?.slice(0, 2000),
      url: window.location.href,
      userAgent: navigator.userAgent,
    });
  });
}
