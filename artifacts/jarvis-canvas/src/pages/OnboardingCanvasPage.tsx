// OnboardingCanvasPage — second step after email verification.
//
// Lifted wholesale from the old SignInPage. Two key changes:
//   1. Guarded — only reachable by authenticated users who don't yet have
//      canvasBaseUrl. If you're already connected, you go to /dashboard.
//   2. After successful connect, the existing dashboard auto-sync kicks in
//      via its own useEffect — we just navigate there and let it take over.
//
// Token instructions, OAuth button, and PAT flow all kept the same as
// before. Error handling now uses the new code-based classifier so a
// server bug no longer surfaces as "school firewall".

import { useState, useEffect, useMemo } from "react";
import { ArrowRight, Loader2, Shield, AlertCircle, Eye, EyeOff, RefreshCw, ExternalLink, CheckCircle2 } from "lucide-react";
import { useLocation } from "wouter";
import { apiUrl } from "../lib/api-base";

// Normalize user input: add https:// if they forgot it.
function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

const CANVAS_URL_PATTERNS = [
  /^https?:\/\/[a-z0-9-]+\.instructure\.com\/?$/i,
  /^https?:\/\/canvas\.[a-z0-9.-]+\/?$/i,
  /^https?:\/\/[a-z0-9-]+\.canvas\.[a-z0-9.-]+\/?$/i,
];
function looksLikeCanvasUrl(u: string): boolean {
  const normalized = normalizeUrl(u);
  return CANVAS_URL_PATTERNS.some((re) => re.test(normalized));
}

function schoolNameFromUrl(u: string): string {
  try {
    const host = new URL(normalizeUrl(u)).hostname;
    const first = host.split(".")[0];
    return first.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return "your school";
  }
}

// Distinct error states so we can show actionable recovery UI per case.
type ConnectError =
  | { kind: "bad_url" }
  | { kind: "missing_token" }
  | { kind: "token_rejected" }
  | { kind: "canvas_unreachable" }
  | { kind: "service_down" }
  | { kind: "server_error"; statusCode?: number }
  | { kind: "rate_limited" }
  | { kind: "network" };

type ConnectStage = "idle" | "verifying_token" | "loading_courses" | "almost_done";

export default function OnboardingCanvasPage() {
  const [, navigate] = useLocation();
  const [canvasUrl, setCanvasUrl] = useState("");
  const [pat, setPat] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<ConnectError | null>(null);
  const [stage, setStage] = useState<ConnectStage>("idle");
  const [oauthStatus, setOauthStatus] = useState<"idle" | "redirecting">("idle");

  // Guard: must be authenticated AND not have canvasBaseUrl yet. If the
  // user is already connected, send them straight to the dashboard.
  // If they're not authed at all, send them to /signin.
  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl("/api/user/data"), { credentials: "include" })
      .then((res) => {
        if (cancelled) return;
        if (res.status === 401) {
          navigate("/signin", { replace: true });
          return;
        }
        if (res.ok) {
          res.json().then((data) => {
            if (cancelled) return;
            if (data?.user?.canvasBaseUrl) {
              navigate("/dashboard", { replace: true });
            }
          }).catch(() => { /* ignore */ });
        }
      })
      .catch(() => { /* offline — render the form */ });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // Prefill URL from localStorage if user lost a tab mid-onboarding.
  useEffect(() => {
    try {
      const draft = localStorage.getItem("carvis_signin_draft");
      if (draft) {
        const parsed = JSON.parse(draft);
        if (typeof parsed.canvasUrl === "string") setCanvasUrl(parsed.canvasUrl);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (canvasUrl) {
      try {
        localStorage.setItem("carvis_signin_draft", JSON.stringify({ canvasUrl }));
      } catch { /* ignore */ }
    }
  }, [canvasUrl]);

  const handleConnect = async () => {
    const url = canvasUrl.trim();
    const token = pat.trim();

    if (!url) { setError({ kind: "bad_url" }); return; }
    if (!looksLikeCanvasUrl(url)) { setError({ kind: "bad_url" }); return; }
    if (!token) { setError({ kind: "missing_token" }); return; }

    setError(null);
    setStage("verifying_token");

    try {
      const res = await fetch(apiUrl("/api/auth/canvas/pat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ canvasUrl: url, pat: token }),
      });

      if (!res.ok) {
        // Use the new `code` field. network kind ONLY fires for true fetch
        // failures (see catch below). server_error / rate_limited are
        // distinguished from the canvas-specific errors.
        let data: { error?: string; code?: string } = {};
        try { data = await res.json(); } catch { /* no body */ }
        const code = data.code ?? "";
        if (code === "token_rejected") setError({ kind: "token_rejected" });
        else if (code === "canvas_unreachable") setError({ kind: "canvas_unreachable" });
        else if (code === "service_down") setError({ kind: "service_down" });
        else if (code === "rate_limited") setError({ kind: "rate_limited" });
        else if (code === "server_error" || res.status >= 500) setError({ kind: "server_error", statusCode: res.status });
        else setError({ kind: "server_error", statusCode: res.status });
        setStage("idle");
        return;
      }

      const data = await res.json();
      if (data.sessionToken) {
        setStage("loading_courses");
        await new Promise((r) => setTimeout(r, 250));
        setStage("almost_done");
        // Session cookie is the source of truth — no localStorage mirror
        // on the web app. The extension iframe has its own flow.
        try { localStorage.removeItem("carvis_signin_draft"); } catch { /* ignore */ }
        // Hand off to the dashboard. Its useEffect auto-fires the first
        // sync (we already wired this in the first-90-seconds plan).
        navigate("/dashboard", { replace: true });
        return;
      }

      setStage("idle");
      setError({ kind: "server_error" });
    } catch {
      // Real fetch failure (offline, DNS, CORS preflight). Only here do we
      // surface the "school firewall" copy.
      setError({ kind: "network" });
      setStage("idle");
    }
  };

  const handleOAuth = async () => {
    const url = canvasUrl.trim();
    if (!url) { setError({ kind: "bad_url" }); return; }
    if (!looksLikeCanvasUrl(url)) { setError({ kind: "bad_url" }); return; }

    setError(null);
    setOauthStatus("redirecting");

    try {
      const res = await fetch(apiUrl("/api/auth/canvas/start"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ canvasUrl: url }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError({ kind: "canvas_unreachable" });
        setOauthStatus("idle");
      }
    } catch {
      setError({ kind: "network" });
      setOauthStatus("idle");
    }
  };

  const school = schoolNameFromUrl(canvasUrl);
  const stageLabel = stage === "idle"
    ? "CONNECT CANVAS"
    : stage === "verifying_token"
      ? `VERIFYING TOKEN WITH ${school.toUpperCase()}…`
      : stage === "loading_courses"
        ? "LOADING YOUR COURSES…"
        : "ALMOST DONE…";

  return (
    <div className="hud-bg min-h-screen text-[#f5f5f5] font-sans flex items-center justify-center px-6 py-12">
      <div className="hud-scanline" />
      <div className="relative z-10 w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <img src="/carvis-logo.png" alt="" className="h-10 w-10 object-contain" />
          <span className="text-2xl font-bold tracking-[0.2em] text-[#FF4444]">CARVIS</span>
        </div>

        <div className="hud-panel p-8">
          <span className="corner-br" />

          <div className="text-center mb-6">
            <h1 className="font-orbitron text-lg font-bold tracking-[0.15em] text-[#FF4444] mb-2">CONNECT CANVAS</h1>
            <p className="font-rajdhani text-[13px] text-[rgba(245,245,245,0.4)]">
              Last step — link your Canvas so we can pull in your courses, assignments, and grades.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="canvas-url" className="font-orbitron text-[10px] font-bold tracking-[0.15em] text-[rgba(245,245,245,0.4)] mb-2 block">CANVAS URL</label>
              <input
                id="canvas-url"
                type="url"
                value={canvasUrl}
                onChange={(e) => { setCanvasUrl(e.target.value); setError(null); }}
                placeholder="https://school.instructure.com"
                className="w-full px-4 py-3 bg-[#0a0000] border border-[rgba(160,21,21,0.25)] text-[#f5f5f5] font-mono text-[13px] placeholder:text-[rgba(245,245,245,0.25)] focus:border-[#FF4444]/50 focus:outline-none transition rounded-lg"
                autoFocus
                aria-invalid={error?.kind === "bad_url" ? true : undefined}
                aria-describedby="canvas-url-help"
              />
              <p id="canvas-url-help" className="font-rajdhani text-[10px] text-[rgba(245,245,245,0.3)] mt-1.5">
                Usually ends in <span className="text-[rgba(245,245,245,0.5)]">.instructure.com</span> or <span className="text-[rgba(245,245,245,0.5)]">canvas.&lt;school&gt;.edu</span>
              </p>
            </div>

            <div>
              <label htmlFor="canvas-pat" className="font-orbitron text-[10px] font-bold tracking-[0.15em] text-[rgba(245,245,245,0.4)] mb-2 block">ACCESS TOKEN</label>
              <div className="relative">
                <input
                  id="canvas-pat"
                  type={showToken ? "text" : "password"}
                  value={pat}
                  onChange={(e) => { setPat(e.target.value); setError(null); }}
                  placeholder="Paste your Canvas access token"
                  className="w-full px-4 py-3 pr-10 bg-[#0a0000] border border-[rgba(160,21,21,0.25)] text-[#f5f5f5] font-mono text-[13px] placeholder:text-[rgba(245,245,245,0.25)] focus:border-[#FF4444]/50 focus:outline-none transition rounded-lg"
                  onKeyDown={(e) => e.key === "Enter" && stage === "idle" && handleConnect()}
                  aria-invalid={error?.kind === "token_rejected" || error?.kind === "missing_token" ? true : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgba(245,245,245,0.4)] hover:text-[#FF4444] transition"
                  aria-label={showToken ? "Hide token" : "Show token"}
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              onClick={handleConnect}
              disabled={stage !== "idle"}
              className="w-full hud-btn-primary hud-btn px-5 py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {stage === "idle" ? (
                <><span>{stageLabel}</span><ArrowRight className="w-4 h-4" /></>
              ) : (
                <><Loader2 className="w-4 h-4 hud-sync-active" /><span>{stageLabel}</span></>
              )}
            </button>

            {error && <ErrorBlock error={error} onRetry={() => setError(null)} canvasUrl={canvasUrl} />}

            <div className="flex items-center gap-3 pt-2">
              <div className="flex-1 h-px bg-[rgba(160,21,21,0.15)]" />
              <span className="font-orbitron text-[10px] tracking-[0.15em] text-[rgba(245,245,245,0.25)]">OR</span>
              <div className="flex-1 h-px bg-[rgba(160,21,21,0.15)]" />
            </div>
            <button
              onClick={handleOAuth}
              disabled={oauthStatus !== "idle" || stage !== "idle" || !canvasUrl.trim()}
              className="w-full px-5 py-3 flex items-center justify-center gap-2 border border-[#00B4FF]/30 bg-[#00B4FF]/10 text-[#00B4FF] font-orbitron text-[11px] font-bold tracking-[0.1em] hover:bg-[#00B4FF]/20 hover:border-[#00B4FF]/50 transition disabled:opacity-40 disabled:cursor-not-allowed rounded-lg"
            >
              {oauthStatus === "redirecting" ? (
                <><Loader2 className="w-4 h-4 hud-sync-active" /><span>REDIRECTING TO CANVAS…</span></>
              ) : (
                <><span>SIGN IN WITH CANVAS OAUTH</span></>
              )}
            </button>
            <p className="font-rajdhani text-[11px] text-[rgba(245,245,245,0.4)] text-center">
              Authorize CARVIS to read your Canvas data — no token paste needed.
            </p>
          </div>

          <div className="flex items-start gap-2 mt-6 pt-4 border-t border-[rgba(160,21,21,0.15)]">
            <Shield className="w-4 h-4 text-[rgba(245,245,245,0.4)] mt-0.5 shrink-0" />
            <p className="font-rajdhani text-[11px] text-[rgba(245,245,245,0.4)] leading-relaxed">
              Your token is AES-256 encrypted before storage and never shared.
              CARVIS only reads your Canvas data — it never modifies anything.
            </p>
          </div>
        </div>

        <TokenInstructions />
      </div>
    </div>
  );
}

function ErrorBlock({ error, onRetry, canvasUrl }: { error: ConnectError; onRetry: () => void; canvasUrl: string }) {
  const base = "flex items-start gap-3 p-3 border rounded-lg";
  const tone = "bg-[#FF6B3D]/10 border-[#FF6B3D]/20";

  if (error.kind === "bad_url") {
    return (
      <div className={`${base} ${tone}`}>
        <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-rajdhani text-[12px] text-[#FF6B3D] font-semibold">That doesn't look like a Canvas URL</p>
          <p className="font-rajdhani text-[11px] text-[rgba(255,107,61,0.8)] mt-1">
            Canvas URLs look like <span className="font-mono">school.instructure.com</span> or <span className="font-mono">canvas.school.edu</span>. Copy the URL from your browser's address bar while logged into Canvas.
          </p>
        </div>
      </div>
    );
  }

  if (error.kind === "missing_token") {
    return (
      <div className={`${base} ${tone}`}>
        <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-rajdhani text-[12px] text-[#FF6B3D] font-semibold">Paste your access token to continue</p>
          <p className="font-rajdhani text-[11px] text-[rgba(255,107,61,0.8)] mt-1">
            You can generate one in Canvas under <span className="font-mono">Account → Settings → New Access Token</span>.
          </p>
        </div>
      </div>
    );
  }

  if (error.kind === "token_rejected") {
    return (
      <div className={`${base} ${tone}`}>
        <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-rajdhani text-[12px] text-[#FF6B3D] font-semibold">Canvas is online — but your token was rejected</p>
          <p className="font-rajdhani text-[11px] text-[rgba(255,107,61,0.8)] mt-1">
            We found <span className="font-mono">{canvasUrl}</span> ✓ — the token just doesn't work. Tokens expire or get revoked. Generate a fresh one in <span className="font-mono">Canvas → Account → Settings → + New Access Token</span> and paste it above.
          </p>
          <button onClick={onRetry} className="font-orbitron text-[10px] tracking-[0.1em] text-[#FF4444] mt-2 inline-flex items-center gap-1 hover:underline">
            <RefreshCw className="w-3 h-3" /> CLEAR & TRY AGAIN
          </button>
        </div>
      </div>
    );
  }

  if (error.kind === "canvas_unreachable") {
    return (
      <div className={`${base} ${tone}`}>
        <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-rajdhani text-[12px] text-[#FF6B3D] font-semibold">Couldn't find <span className="font-mono">{canvasUrl}</span></p>
          <p className="font-rajdhani text-[11px] text-[rgba(255,107,61,0.8)] mt-1">
            That Canvas URL doesn't respond. Check for typos — common mistakes include missing <span className="font-mono">https://</span>, trailing paths, or spelling your school's subdomain wrong. If you're sure it's right, your school's Canvas may be behind a firewall.
          </p>
        </div>
      </div>
    );
  }

  if (error.kind === "service_down") {
    return (
      <div className={`${base} ${tone}`}>
        <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-rajdhani text-[12px] text-[#FF6B3D] font-semibold">CARVIS is temporarily unavailable</p>
          <p className="font-rajdhani text-[11px] text-[rgba(255,107,61,0.8)] mt-1">
            Our database is restarting. This is on us — try again in a minute.
          </p>
          <button onClick={onRetry} className="font-orbitron text-[10px] tracking-[0.1em] text-[#FF4444] mt-2 inline-flex items-center gap-1 hover:underline">
            <RefreshCw className="w-3 h-3" /> RETRY
          </button>
        </div>
      </div>
    );
  }

  if (error.kind === "server_error") {
    return (
      <div className={`${base} ${tone}`}>
        <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-rajdhani text-[12px] text-[#FF6B3D] font-semibold">Something went wrong on our end</p>
          <p className="font-rajdhani text-[11px] text-[rgba(255,107,61,0.8)] mt-1">
            {error.statusCode ? `(status ${error.statusCode}) ` : ""}Try again in a moment. If it keeps happening, the issue is on our side.
          </p>
          <button onClick={onRetry} className="font-orbitron text-[10px] tracking-[0.1em] text-[#FF4444] mt-2 inline-flex items-center gap-1 hover:underline">
            <RefreshCw className="w-3 h-3" /> RETRY
          </button>
        </div>
      </div>
    );
  }

  if (error.kind === "rate_limited") {
    return (
      <div className={`${base} ${tone}`}>
        <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-rajdhani text-[12px] text-[#FF6B3D] font-semibold">Too many attempts</p>
          <p className="font-rajdhani text-[11px] text-[rgba(255,107,61,0.8)] mt-1">
            Wait a minute and try again.
          </p>
        </div>
      </div>
    );
  }

  // network — only fires when fetch() itself threw (real offline / CORS preflight).
  return (
    <div className={`${base} ${tone}`}>
      <AlertCircle className="w-4 h-4 text-[#FF6B3D] mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="font-rajdhani text-[12px] text-[#FF6B3D] font-semibold">Connection error</p>
        <p className="font-rajdhani text-[11px] text-[rgba(255,107,61,0.8)] mt-1">
          Check your internet connection and try again. If the issue persists, CARVIS may be blocked by a school firewall.
        </p>
        <button onClick={onRetry} className="font-orbitron text-[10px] tracking-[0.1em] text-[#FF4444] mt-2 inline-flex items-center gap-1 hover:underline">
          <RefreshCw className="w-3 h-3" /> RETRY
        </button>
      </div>
    </div>
  );
}

function TokenInstructions() {
  const steps = [
    { num: 1, label: "Log in to your school's Canvas" },
    { num: 2, label: "Open Account → Settings", shot: "Canvas settings menu" },
    { num: 3, label: "Scroll to Approved Integrations", shot: "Settings page, Approved Integrations section" },
    { num: 4, label: "Click + New Access Token", shot: "New Access Token button" },
    { num: 5, label: 'Name it "CARVIS" and click Generate Token', shot: "Generate token dialog" },
    { num: 6, label: "Copy the token and paste it above", shot: "Token displayed once — copy immediately" },
  ];

  return (
    <div className="hud-panel p-4 mt-4">
      <p className="font-orbitron text-[10px] font-bold tracking-[0.1em] text-[rgba(245,245,245,0.4)] mb-3">HOW TO GET YOUR TOKEN</p>
      <ol className="space-y-3">
        {steps.map((step) => (
          <li key={step.num} className="flex gap-3">
            <div className="shrink-0 w-5 h-5 rounded-full border border-[rgba(160,21,21,0.4)] flex items-center justify-center font-orbitron text-[10px] text-[#FF4444]">
              {step.num}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-rajdhani text-[11px] text-[rgba(245,245,245,0.6)] leading-snug">{step.label}</p>
              {step.shot && (
                <div
                  className="mt-1.5 h-12 rounded border border-dashed border-[rgba(160,21,21,0.2)] bg-[rgba(160,21,21,0.04)] flex items-center justify-center font-rajdhani text-[10px] text-[rgba(245,245,245,0.25)]"
                  aria-label={`Screenshot placeholder: ${step.shot}`}
                >
                  📷 {step.shot}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      <a
        href="https://community.canvaslms.com/t5/Student-Guide/How-do-I-manage-access-tokens-as-a-student/ta-p/244"
        target="_blank"
        rel="noreferrer"
        className="font-rajdhani text-[10px] text-[rgba(245,245,245,0.3)] mt-3 inline-flex items-center gap-1 hover:text-[#FF4444] transition"
      >
        Need more help? Canvas's official guide <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}
