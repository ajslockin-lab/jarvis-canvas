import { useState, useEffect } from "react";
import { Volume2, VolumeX, Bell, BellOff, Moon, User, AlertCircle, RefreshCw, ArrowLeft, Zap } from "lucide-react";
import CanvasConnectButton from "@/components/auth/CanvasConnectButton";
import { Link } from "wouter";

export default function SettingsPage() {
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [proactiveAlerts, setProactiveAlerts] = useState(true);
  const [energyLevel, setEnergyLevel] = useState(3);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [canvasConnected, setCanvasConnected] = useState(false);

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

  return (
    <div className="hud-bg min-h-screen text-[#e8f4f8]">
      <div className="hud-scanline" />
      <div className="relative z-10 max-w-2xl mx-auto p-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center border border-[#00B4FF]/40 bg-[#00B4FF]/10">
              <Zap className="w-4 h-4 text-[#00E5FF]" />
            </div>
            <div>
              <h1 className="font-orbitron text-lg font-bold tracking-[0.15em] text-[#00E5FF]">SYSTEM CONFIG</h1>
              <p className="font-rajdhani text-[11px] text-[#5a7a8a] tracking-wide">PERSONALIZE JARVIS OPERATIONS</p>
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
              description="JARVIS reads responses out loud"
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
            <p className="font-rajdhani text-[13px] text-[#5a7a8a]">How much energy you typically have. JARVIS uses this to suggest study tasks.</p>
            <div className="flex items-center gap-3">
              <span className="font-orbitron text-[10px] text-[#5a7a8a] tracking-wider">LOW</span>
              <div className="flex-1 grid grid-cols-5 gap-1">
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    onClick={() => setEnergyLevel(level)}
                    className={`h-10 transition-all ${level <= energyLevel ? "border border-[#00E5FF]/50 bg-[#00E5FF]/10 shadow-[0_0_8px_rgba(0,229,255,0.15)]" : "border border-[#00B4FF]/10 bg-[#0A1520]/50 hover:border-[#00B4FF]/25"}`}
                  >
                    <span className="sr-only">Energy {level}</span>
                  </button>
                ))}
              </div>
              <span className="font-orbitron text-[10px] text-[#5a7a8a] tracking-wider">HIGH</span>
            </div>
            <p className="font-rajdhani text-[13px] text-[#00E5FF]">
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
                Your Canvas token is encrypted and never leaves the server. JARVIS only reads your Canvas data — it never modifies anything.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="hud-panel mb-8 p-6">
      <span className="corner-br" />
      <div className="hud-section-header mb-5">
        <div className="p-1.5 border border-[#00B4FF]/20 text-[#00B4FF]">{icon}</div>
        <h2 className="font-orbitron text-[11px] font-bold tracking-[0.2em] text-[#00B4FF]">{title}</h2>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function ToggleRow({ icon, label, description, enabled, onToggle }: { icon: React.ReactNode; label: string; description: string; enabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        <div className="p-1.5 border border-[#00B4FF]/10 text-[#5a7a8a]">{icon}</div>
        <div>
          <p className="font-orbitron text-[11px] font-bold tracking-[0.1em] text-[#e8f4f8]">{label}</p>
          <p className="font-rajdhani text-[11px] text-[#5a7a8a]">{description}</p>
        </div>
      </div>
      <button onClick={onToggle} className={`relative w-12 h-6 transition-colors ${enabled ? "bg-[#00B4FF]/40" : "bg-[#0A1520] border border-[#00B4FF]/10"}`}>
        <div className={`absolute top-0.5 w-5 h-5 transition-transform shadow-sm ${enabled ? "translate-x-6 bg-[#00E5FF]" : "translate-x-0.5 bg-[#5a7a8a]"}`} />
      </button>
    </div>
  );
}
