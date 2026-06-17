"use client";

import { useState, useEffect } from "react";
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
  maxItems?: number;
}

const iconFor: Record<string, React.ReactNode> = {
  deadline: <Clock className="w-4 h-4 text-[#FF9500]" />,
  grade: <Zap className="w-4 h-4 text-[#00B4FF]" />,
  suggestion: <Sparkles className="w-4 h-4 text-[#00FF88]" />,
  warning: <AlertTriangle className="w-4 h-4 text-[#FF4D4D]" />,
};

function generateAlerts(courses: { name: string; assignments: { name: string; dueDate: string | null }[] }[]): ProactiveAlert[] {
  const now = new Date();
  const alerts: ProactiveAlert[] = [];

  // Flatten all upcoming assignments with due dates
  const allUpcoming = courses.flatMap((c) =>
    c.assignments
      .filter((a) => a.dueDate && new Date(a.dueDate) >= now)
      .map((a) => ({ ...a, courseName: c.name }))
  ).sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());

  // Urgent: due within 24 hours
  const urgent = allUpcoming.filter((a) => {
    const hours = (new Date(a.dueDate!).getTime() - now.getTime()) / (1000 * 60 * 60);
    return hours > 0 && hours < 24;
  });

  for (const a of urgent.slice(0, 2)) {
    const hours = Math.ceil((new Date(a.dueDate!).getTime() - now.getTime()) / (1000 * 60 * 60));
    alerts.push({
      id: `urgent-${a.name}`,
      type: "deadline",
      title: `${a.name.toUpperCase()}`,
      message: `Due in ${hours}h — ${a.courseName}. Start now to finish on time.`,
      action: "#",
      actionLabel: "START NOW",
      dismissable: true,
      urgent: true,
    });
  }

  // Warning: overdue
  const overdue = courses.flatMap((c) =>
    c.assignments
      .filter((a) => a.dueDate && new Date(a.dueDate) < now)
      .map((a) => ({ ...a, courseName: c.name }))
  );

  if (overdue.length > 0) {
    alerts.push({
      id: "overdue",
      type: "warning",
      title: `${overdue.length} OVERDUE ASSIGNMENT${overdue.length > 1 ? "S" : ""}`,
      message: `You have ${overdue.length} past-due item${overdue.length > 1 ? "s" : ""}. Check if submissions are still accepted.`,
      dismissable: true,
      urgent: true,
    });
  }

  // Suggestion: heavy workload day
  const thisWeek = allUpcoming.filter((a) => {
    const hours = (new Date(a.dueDate!).getTime() - now.getTime()) / (1000 * 60 * 60);
    return hours > 0 && hours < 168;
  });

  if (thisWeek.length >= 3) {
    alerts.push({
      id: "workload",
      type: "suggestion",
      title: "HEAVY WEEK AHEAD",
      message: `${thisWeek.length} assignments due this week. Spread them out — start the hardest ones first.`,
      dismissable: true,
    });
  } else if (thisWeek.length > 0 && urgent.length === 0) {
    // Find free windows — days with no assignments due
    const firstDue = thisWeek[0];
    const hoursToFirst = Math.ceil((new Date(firstDue.dueDate!).getTime() - now.getTime()) / (1000 * 60 * 60));
    if (hoursToFirst > 48) {
      alerts.push({
        id: "free-window",
        type: "suggestion",
        title: "FREE WINDOW DETECTED",
        message: `Nothing due for ${Math.round(hoursToFirst / 24)} days. Get ahead on "${firstDue.name}" — due ${new Date(firstDue.dueDate!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`,
        action: "#",
        actionLabel: "PLAN IT",
        dismissable: true,
      });
    }
  }

  // Coming up: next assignment
  if (allUpcoming.length > 0 && urgent.length === 0 && overdue.length === 0) {
    const next = allUpcoming[0];
    const days = Math.ceil((new Date(next.dueDate!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    alerts.push({
      id: "next-up",
      type: "deadline",
      title: next.name.toUpperCase(),
      message: `Due in ${days} day${days > 1 ? "s" : ""} — ${next.courseName}`,
      dismissable: true,
    });
  }

  return alerts.length > 0 ? alerts : [];
}

export default function ProactiveFeed({ maxItems = 3 }: ProactiveFeedProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [alerts, setAlerts] = useState<ProactiveAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/user/data")
      .then((r) => r.json())
      .then((data) => {
        const courses = Array.isArray(data.courses) ? data.courses : [];
        setAlerts(generateAlerts(courses));
      })
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }, []);

  const handleDismiss = (id: string) => {
    setDismissed((prev) => new Set([...prev, id]));
  };

  const visibleAlerts = alerts.filter((a) => !dismissed.has(a.id)).slice(0, maxItems);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 rounded bg-[#0A1520]/50 animate-pulse" />
        ))}
      </div>
    );
  }

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
                <a href={alert.action} className="mt-2 font-mono-data text-[11px] text-[#00B4FF] hover:text-[#00E5FF] font-bold transition tracking-wide inline-block">
                  {alert.actionLabel}
                </a>
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
