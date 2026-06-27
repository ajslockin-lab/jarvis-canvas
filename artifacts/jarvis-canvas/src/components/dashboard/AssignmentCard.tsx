import { useState } from "react";
import { ExternalLink, Check } from "lucide-react";
import { apiUrl } from "@/lib/api-base";

interface AssignmentCardProps {
  id?: string;
  name: string;
  courseName?: string;
  dueDate?: string | Date | null;
  url?: string | null;
  points?: number | null;
  completed?: boolean;
  referenceDate?: Date;
  onToggle?: (id: string, completed: boolean) => void;
}

export default function AssignmentCard({
  id, name, courseName, dueDate, url, points, completed = false, referenceDate = new Date(0), onToggle,
}: AssignmentCardProps) {
  const [isCompleted, setIsCompleted] = useState(completed);
  const [toggling, setToggling] = useState(false);

  const getUrgency = (date: Date) => {
    const diff = date.getTime() - referenceDate.getTime();
    const hours = diff / (1000 * 60 * 60);
    if (hours < 0) return { color: "text-[#FF4D4D]", dot: "bg-[#FF4D4D]", border: "border-[#FF4D4D]/30" };
    if (hours < 24) return { color: "text-[#FF9500]", dot: "bg-[#FF9500]", border: "border-[#FF9500]/30" };
    if (hours < 72) return { color: "text-[#FF9500]/70", dot: "bg-[#FF9500]/70", border: "border-[#FF9500]/15" };
    return { color: "text-[#FF4444]", dot: "bg-[#FF4444]", border: "border-[#FF4444]/15" };
  };

  const due = dueDate ? new Date(dueDate) : null;
  const urgency = due ? getUrgency(due) : { color: "text-[#5a7a8a]", dot: "bg-[#5a7a8a]", border: "border-[#5a7a8a]/15" };
  const dueText = due ? due.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "N/A";
  const hoursLeft = due ? Math.ceil((due.getTime() - referenceDate.getTime()) / (1000 * 60 * 60)) : null;
  const isOverdue = hoursLeft !== null && hoursLeft < 0;
  const isUrgent = hoursLeft !== null && hoursLeft < 24 && hoursLeft >= 0;
  const dueTime = due ? due.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";

  const handleToggle = async () => {
    if (!id || toggling) return;
    setToggling(true);
    const prevCompleted = isCompleted;
    setIsCompleted(!prevCompleted);
    try {
      const res = await fetch(apiUrl(`/api/canvas/assignments/${encodeURIComponent(id)}/complete`), {
        method: "PATCH",
        credentials: "include",
      });
      if (!res.ok) {
        setIsCompleted(prevCompleted);
      } else {
        const data = await res.json();
        setIsCompleted(data.completed);
        onToggle?.(id, data.completed);
      }
    } catch {
      setIsCompleted(prevCompleted);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className={`hud-card group ${isCompleted ? "opacity-60" : ""}`}>
      <div
        className="p-4 h-full flex flex-col"
        style={{ borderLeft: isCompleted ? "2px solid #22c55e" : isOverdue ? "2px solid #ef4444" : isUrgent ? "2px solid #FF6B3D" : "2px solid #FF4444" }}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-start gap-2 min-w-0">
            <button
              onClick={handleToggle}
              disabled={toggling}
              className={`w-4 h-4 mt-1 rounded-sm border shrink-0 flex items-center justify-center transition ${isCompleted ? "bg-[#00FF88]/20 border-[#00FF88]/50 text-[#00FF88]" : "border-[#5a7a8a]/40 hover:border-[#00FF88]/60 text-transparent hover:text-[#00FF88]/40"}`}
            >
              <Check className="w-3 h-3" />
            </button>
            <h3 className={`font-orbitron text-[13px] font-bold leading-tight truncate ${isCompleted ? "text-[#5a7a8a] line-through" : "text-[#e8f4f8]"}`}>{name}</h3>
          </div>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-[rgba(245,245,245,0.35)] hover:text-[#FF4444] transition opacity-0 group-hover:opacity-100 shrink-0">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {courseName && (
          <p className={`font-mono-data text-[11px] tracking-wide mb-1 ${isCompleted ? "text-[#5a7a8a]/50" : "text-[#5a7a8a]"}`}>{courseName.toUpperCase()}</p>
        )}

        <div className="flex-1" />

        <div className="flex items-center justify-between mt-2 pt-2 border-t border-[rgba(160,21,21,0.1)]">
          <span className={`font-mono-data text-[11px] font-bold ${isCompleted ? "text-[#00FF88]" : isOverdue ? "text-[#FF4D4D]" : urgency.color}`}>
            {isCompleted ? "DONE" : isOverdue ? `OVERDUE ${Math.abs(hoursLeft!)}H` : isUrgent ? `DUE ${hoursLeft}H` : `${dueText} ${dueTime}`}
          </span>
          {points !== null && points !== undefined && (
            <span className="font-mono-data text-[10px] text-[#5a7a8a]">{points} PTS</span>
          )}
        </div>
      </div>
    </div>
  );
}
