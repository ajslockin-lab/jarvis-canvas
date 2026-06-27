import { Component, type ReactNode, type ErrorInfo } from "react";
import { apiUrl } from "@/lib/api-base";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level React error boundary.
 *
 * Without this, an exception thrown by any descendant (bad API response
 * shape, undefined hook, etc.) white-screens the entire app — the root
 * unmounts and the user sees a blank page with no recourse except a
 * hard refresh. This boundary catches it, shows a fallback, gives them
 * a retry button, and forwards the error to /api/errors so the server
 * pino log captures it alongside everything else.
 *
 * The error reporter installed in main.tsx already handles
 * window-level rejections. This covers component-render-time throws
 * that never reach window — the most common prod failures.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Fire-and-forget reporter; the server-side pino log is the
    // ground truth for prod crash visibility.
    try {
      void fetch(apiUrl("/api/errors"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: error.message || "Unknown error",
          stack: (error.stack || "").slice(0, 2000),
          url: window.location.href,
          userAgent: navigator.userAgent,
        }),
        keepalive: true,
      });
    } catch {
      // Reporter failed — silently. The fallback UI still renders.
    }

    // Keep the same ErrorInfo signal in the console for dev — the
    // server-side pino record doesn't include componentStack today.
    if (typeof console !== "undefined") {
      console.error("ErrorBoundary caught:", error, info.componentStack);
    }
  }

  private handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          style={{
            minHeight: "100dvh",
            display: "grid",
            placeItems: "center",
            padding: "2rem",
            fontFamily: "system-ui, -apple-system, sans-serif",
            color: "#f5f5f5",
            background: "#0a0000",
          }}
        >
          <div style={{ maxWidth: 480, textAlign: "center" }}>
            <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.5rem" }}>
              Something went wrong.
           </h1>
            <p
              style={{
                color: "#bbb",
                lineHeight: 1.5,
                margin: "0 0 1.5rem",
              }}
            >
              The page crashed. Your work wasn't lost — try again, and if
              it keeps happening, ping us with the time above the error.
           </p>
            <pre
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.75rem",
                textAlign: "left",
                color: "#888",
                background: "rgba(255,255,255,0.04)",
                padding: "0.75rem",
                borderRadius: 6,
                overflow: "auto",
                maxHeight: 180,
                margin: "0 0 1.5rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {`${new Date().toISOString()} — ${error.message}`}
           </pre>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                background: "#FF3C00",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "0.6rem 1.2rem",
                fontSize: "0.95rem",
                cursor: "pointer",
              }}
            >
              Try again
           </button>
         </div>
       </div>
      );
    }
    return this.props.children;
  }
}
