import { useState, useEffect } from "react";
import { Volume2, VolumeX, Bell, BellOff, Moon, User, AlertCircle, RefreshCw, ArrowLeft, LogOut } from "lucide-react";
import CanvasConnectButton from "@/components/auth/CanvasConnectButton";
import { Link, useLocation } from "wouter";

export default function SettingsPage() {
  const [, navigate] = useLocation();
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [proactiveAlerts, setProactiveAlerts] = useState(true);
  const [energyLevel, setEnergyLevel] = useState(3);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [canvasConnected, setCanvasConnected] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    fetch("/api/user/data", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setCanvasConnected(!!data.user?.canvasBaseUrl))
      .catch(() => setCanvasConnected(false));
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/canvas/sync", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (data.success) {
        setSyncResult(`Synced ${data.courseCount} courses!`);
      } else {
        setSyncResult("Sync failed. Make sure Canvas is connected.");
      }
    } catch {
      setSyncResult("Sync error. Try again.");
    } finally {
      setSyncing(false);
    }
  };

  // Same flow as the dashboard header button. We keep two surfaces because
  // the dashboard header is the fast path (one tap from anywhere) and the
  // settings page is the "I'm here to manage my account" path with bigger
  // affordance + confirmation.
  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch("/api/auth/signout", { method: "POST", credentials: "include" });
    } catch {
      // Best-effort — we still navigate even if the request fails.
    }
    try {
      window.localStorage.removeItem("jarvis_session_token");
    } catch {
      // ignore
    }
    navigate("/signin", { replace: true });
  };

  return (
    <div className="hud-bg min-h-screen text-[#f5f5f5]">
      <div className="hud-scanline" />
      <div className="relative z-10 max-w-2xl mx-auto p-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <img src="/carvis-logo.png" alt="" className="h-8 w-8 object-contain" />
            <div>
              <h1 className="font-orbitron text-lg font-bold tracking-[0.15em] text-[#FF4444]">SYSTEM CONFIG</h1>
              <p className="font-rajdhani text-[11px] text-[rgba(245,245,245,0.35)] tracking-wide">PERSONALIZE CARVIS OPERATIONS</p>
            </div>
          </div>
          <Link href="/dashboard" className="hud-btn px-3 py-2 flex items-center gap-2">
            <ArrowLeft className="w-3 h-3" />
            <span>BACK</span>
          </Link>
        </div>

        <SettingsSection title="CANVAS INTEGRATION" icon={<User className="w-4 h-4" />}>
          <div className="flex flex-col gap-3">
            <p className="font-rajdhani text-[13px] text-[#5a7a8a]">Connect your Canvas account to sync courses, assignments, and grades.</p>
            <CanvasConnectButton connected={canvasConnected} />
            {canvasConnected && <p className="font-mono-data text-[11px] text-[#00FF88]">✓ Canvas connected</p>}
          </div>
        </SettingsSection>

        <SettingsSection title="DATA SYNC" icon={<RefreshCw className="w-4 h-4" />}>
          <div className="flex items-center gap-4">
            <button onClick={handleSync} disabled={syncing} className="hud-btn px-4 py-2.5 flex items-center gap-2 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${syncing ? "hud-sync-active" : ""}`} />
              <span>{syncing ? "SYNCING..." : "SYNC NOW"}</span>
            </button>
            {syncResult && (
              <span className={`font-mono-data text-[11px] font-bold ${syncResult.includes("Synced") ? "text-[#00FF88]" : "text-[#FF9500]"}`}>
                {syncResult.toUpperCase()}
              </span>
            )}
          </div>
        </SettingsSection>

        <SettingsSection title="VOICE & AUDIO" icon={<Volume2 className="w-4 h-4" />}>
          <div className="space-y-4">
            <ToggleRow
              icon={ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              label="TEXT-TO-SPEECH"
              description="CARVIS reads responses out loud"
              enabled={ttsEnabled}
              onToggle={() => setTtsEnabled(!ttsEnabled)}
            />
            <ToggleRow
              icon={proactiveAlerts ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              label="PROACTIVE ALERTS"
              description="Get notifications about deadlines, grades, and study time"
              enabled={proactiveAlerts}
              onToggle={() => setProactiveAlerts(!proactiveAlerts)}
            />
          </div>
        </SettingsSection>

        <SettingsSection title="ENERGY LEVEL" icon={<Moon className="w-4 h-4" />}>
          <div className="space-y-3">
            <p className="font-rajdhani text-[13px] text-[rgba(245,245,245,0.4)]">How much energy you typically have. CARVIS uses this to suggest study tasks.</p>
            <div className="flex items-center gap-3">
              <span className="font-orbitron text-[10px] text-[#5a7a8a] tracking-wider">LOW</span>
              <div className="flex-1 grid grid-cols-5 gap-1">
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    onClick={() => setEnergyLevel(level)}
                    className={`h-10 transition-all rounded ${level <= energyLevel ? "border border-[#FF4444]/50 bg-[#FF4444]/10 shadow-[0_0_8px_rgba(255,68,68,0.15)]" : "border border-[rgba(160,21,21,0.15)] bg-[#0a0000]/50 hover:border-[#FF4444]/25"}`}
                  >
                    <span className="sr-only">Energy {level}</span>
                  </button>
                ))}
              </div>
              <span className="font-orbitron text-[10px] text-[#5a7a8a] tracking-wider">HIGH</span>
            </div>
            <p className="font-rajdhani text-[13px] text-[#FF4444]">
              {energyLevel <= 2 ? "Study shorter, more frequent sessions" : "Longer deep-work blocks work for you"}
            </p>
          </div>
        </SettingsSection>

        <div className="hud-panel p-4 mt-8">
          <span className="corner-br" />
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[#5a7a8a] mt-0.5" />
            <div>
              <p className="font-orbitron text-[11px] font-bold tracking-[0.1em] text-[#e8f4f8] mb-1">SECURITY NOTICE</p>
              <p className="font-rajdhani text-[13px] text-[#5a7a8a]">
                Your Canvas token is encrypted and never leaves the server. CARVIS only reads your Canvas data — it never modifies anything.
              </p>
            </div>
          </div>
        </div>

        {/*
          Sign out section. Big red button — this is a real action that
          drops the user's session, so it deserves its own block, not a
          tiny icon in a corner. Lives at the bottom of settings so the
          user has to scroll past the things they came here to actually
          change before accidentally clicking it.
        */}
        <SettingsSection title="SESSION" icon={<LogOut className="w-4 h-4" />}>
          <div className="flex flex-col gap-3">
            <p className="font-rajdhani text-[13px] text-[#5a7a8a]">
              Sign out of CARVIS on this device. Your account and data stay — you can sign back in any time.
            </p>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="hud-btn px-4 py-2.5 flex items-center gap-2 disabled:opacity-50 w-fit border-[#FF4444]/30 hover:border-[#FF4444] hover:bg-[#FF4444]/10"
            >
              <LogOut className="w-4 h-4" />
              <span>{signingOut ? "SIGNING OUT…" : "SIGN OUT"}</span>
            </button>
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}

function SettingsSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="hud-panel mb-8 p-6">
      <span className="corner-br" />
      <div className="hud-section-header mb-5">
        <div className="p-1.5 border border-[rgba(160,21,21,0.25)] text-[#FF4444] rounded">{icon}</div>
        <h2 className="font-orbitron text-[11px] font-bold tracking-[0.2em] text-[#FF4444]">{title}</h2>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function ToggleRow({ icon, label, description, enabled, onToggle }: { icon: React.ReactNode; label: string; description: string; enabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        <div className="p-1.5 border border-[rgba(160,21,21,0.15)] text-[rgba(245,245,245,0.4)] rounded">{icon}</div>
        <div>
          <p className="font-orbitron text-[11px] font-bold tracking-[0.1em] text-[#f5f5f5]">{label}</p>
          <p className="font-rajdhani text-[11px] text-[rgba(245,245,245,0.4)]">{description}</p>
        </div>
      </div>
      <button onClick={onToggle} className={`relative w-12 h-6 transition-colors rounded-full ${enabled ? "bg-[#FF4444]/40" : "bg-[#0a0000] border border-[rgba(160,21,21,0.15)]"}`}>
        <div className={`absolute top-0.5 w-5 h-5 transition-transform shadow-sm rounded-full ${enabled ? "translate-x-6 bg-[#FF4444]" : "translate-x-0.5 bg-[rgba(245,245,245,0.35)]"}`} />
      </button>
    </div>
  );
}
