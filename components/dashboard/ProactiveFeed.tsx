"use client";

import { useState } from "react";
import { Bell, X, Clock, AlertTriangle, Zap, Sparkles } from "lucide-react";

interface ProactiveAlert {
  id: string;
  type: "deadline" | "grade" | "suggestion" | "warning";
  title: string;
  message: string;
  action?: string;
  actionLabel?: string;
  dismissable?: boolean;
  urgent?: boolean;
}

interface ProactiveFeedProps {
  alerts?: ProactiveAlert[];
  maxItems?: number;
}

const iconFor: Record<string, React.ReactNode> = {
  deadline: <Clock className="w-4 h-4 text-[#FF9500]" />,
  grade: <Zap className="w-4 h-4 text-[#00B4FF]" />,
  suggestion: <Sparkles className="w-4 h-4 text-[#00FF88]" />,
  warning: <AlertTriangle className="w-4 h-4 text-[#FF4D4D]" />,
};

const defaultAlerts: ProactiveAlert[] = [
  {
    id: "1",
    type: "deadline",
    title: "BIO LAB APPROACHING",
    message: "Due tomorrow at 11:59 PM. Estimated time: 3 hours.",
    action: "#",
    actionLabel: "START NOW",
    dismissable: true,
    urgent: true,
  },
  {
    id: "2",
    type: "suggestion",
    title: "FREE WINDOW DETECTED",
    message: "You have 3 hours free. Perfect time for the History essay due Friday.",
    action: "#",
    actionLabel: "PLAN IT",
    dismissable: true,
  },
];

export default function ProactiveFeed({ alerts = defaultAlerts, maxItems = 3 }: ProactiveFeedProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const handleDismiss = (id: string) => {
    setDismissed((prev) => new Set([...prev, id]));
  };

  const visibleAlerts = alerts.filter((a) => !dismissed.has(a.id)).slice(0, maxItems);

  if (visibleAlerts.length === 0) {
    return (
      <div className="text-center py-6">
        <Bell className="w-5 h-5 text-[#5a7a8a] mx-auto mb-2 opacity-50" />
        <p className="font-orbitron text-[11px] text-[#5a7a8a] tracking-wider">ALL CLEAR</p>
        <p className="font-mono-data text-[10px] text-[#5a7a8a] mt-1">NO INTEL AT THIS TIME</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visibleAlerts.map((alert) => (
        <div
          key={alert.id}
          className={`hud-alert p-4 group ${alert.urgent ? "hud-alert-urgent" : ""}`}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex-shrink-0">{iconFor[alert.type]}</div>
            <div className="flex-1 min-w-0">
              <h4 className="font-orbitron text-[11px] font-bold tracking-[0.1em] text-[#e8f4f8] mb-1">
                {alert.title}
              </h4>
              <p className="font-rajdhani text-[13px] text-[#5a7a8a] leading-relaxed">{alert.message}</p>
              {alert.action && alert.actionLabel && (
                <button className="mt-2 font-mono-data text-[11px] text-[#00B4FF] hover:text-[#00E5FF] font-bold transition tracking-wide">
                  {alert.actionLabel}
                </button>
              )}
            </div>
            {alert.dismissable && (
              <button
                onClick={() => handleDismiss(alert.id)}
                className="p-1 text-[#5a7a8a] hover:text-[#e8f4f8] opacity-0 group-hover:opacity-100 transition"
                title="Dismiss"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
