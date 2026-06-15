"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";

interface AssignmentCardProps {
  name: string;
  courseName?: string;
  dueDate?: string | Date | null;
  url?: string | null;
  points?: number | null;
  referenceDate?: Date;
}

export default function AssignmentCard({
  name,
  courseName,
  dueDate,
  url,
  points,
  referenceDate = new Date(0),
}: AssignmentCardProps) {
  const getUrgency = (date: Date) => {
    const diff = date.getTime() - referenceDate.getTime();
    const hours = diff / (1000 * 60 * 60);

    if (hours < 0) return { color: "text-[#FF4D4D]", dot: "bg-[#FF4D4D]", border: "border-[#FF4D4D]/30", glow: "rgba(255,77,77,0.2)" };
    if (hours < 24) return { color: "text-[#FF9500]", dot: "bg-[#FF9500]", border: "border-[#FF9500]/30", glow: "rgba(255,149,0,0.2)" };
    if (hours < 72) return { color: "text-[#FF9500]/70", dot: "bg-[#FF9500]/70", border: "border-[#FF9500]/15", glow: "rgba(255,149,0,0.1)" };
    return { color: "text-[#00B4FF]", dot: "bg-[#00B4FF]", border: "border-[#00B4FF]/15", glow: "rgba(0,180,255,0.1)" };
  };

  const due = dueDate ? new Date(dueDate) : null;
  const urgency = due ? getUrgency(due) : { color: "text-[#5a7a8a]", dot: "bg-[#5a7a8a]", border: "border-[#5a7a8a]/15", glow: "rgba(90,122,138,0.1)" };

  const dueText = due
    ? due.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "N/A";

  const hoursLeft = due ? Math.ceil((due.getTime() - referenceDate.getTime()) / (1000 * 60 * 60)) : null;
  const isOverdue = hoursLeft !== null && hoursLeft < 0;
  const isUrgent = hoursLeft !== null && hoursLeft < 24 && hoursLeft >= 0;

  const dueTime = due
    ? due.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
    : "";

  return (
    <div className="hud-card group">
      <div
        className="p-4 h-full flex flex-col"
        style={{ borderLeft: isOverdue ? "2px solid #FF4D4D" : isUrgent ? "2px solid #FF9500" : "2px solid #00B4FF" }}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-start gap-2 min-w-0">
            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${urgency.dot} ${isUrgent ? "animate-pulse" : ""}`} />
            <h3 className="font-orbitron text-[13px] font-bold text-[#e8f4f8] leading-tight truncate">
              {name}
            </h3>
          </div>
          {url && (
            <Link
              href={url}
              target="_blank"
              className="text-[#5a7a8a] hover:text-[#00E5FF] transition opacity-0 group-hover:opacity-100 shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>

        {courseName && (
          <p className="font-mono-data text-[11px] text-[#5a7a8a] tracking-wide mb-1">
            {courseName.toUpperCase()}
          </p>
        )}

        <div className="flex-1" />

        <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#00B4FF]/5">
          <span className={`font-mono-data text-[11px] font-bold ${isOverdue ? "text-[#FF4D4D]" : urgency.color}`}>
            {isOverdue ? `OVERDUE ${Math.abs(hoursLeft)}H` : isUrgent ? `DUE ${hoursLeft}H` : `${dueText} ${dueTime}`}
          </span>
          {points !== null && points !== undefined && (
            <span className="font-mono-data text-[10px] text-[#5a7a8a]">
              {points} PTS
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
