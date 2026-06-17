import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Circle } from "lucide-react";

interface Assignment {
  id: string;
  name: string;
  dueDate: Date | string | null;
  course?: { name: string; color?: string | null };
}

interface FunctionalCalendarProps {
  assignments: Assignment[];
  referenceDate?: Date;
}

export default function FunctionalCalendar({ assignments, referenceDate = new Date(0) }: FunctionalCalendarProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const today = useMemo(() => {
    const d = new Date(referenceDate);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [referenceDate]);

  const days = useMemo(() => {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      return date;
    });
  }, [today, weekOffset]);

  const getDayAssignments = (date: Date) => {
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end = new Date(date); end.setHours(23, 59, 59, 999);
    return assignments.filter((a) => {
      if (!a.dueDate) return false;
      const due = new Date(a.dueDate);
      return due >= start && due <= end;
    });
  };

  const isToday = (date: Date) => {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  };

  const isPast = (date: Date) => {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    return d < today;
  };

  const getUrgency = (dueDate: string | Date | null) => {
    if (!dueDate) return "neutral";
    const hoursLeft = (new Date(dueDate).getTime() - referenceDate.getTime()) / (1000 * 60 * 60);
    if (hoursLeft < 0) return "overdue";
    if (hoursLeft < 24) return "urgent";
    if (hoursLeft < 72) return "warning";
    return "safe";
  };

  const urgencyColor = (type: string) => {
    switch (type) {
      case "overdue": return "bg-[#FF4D4D]";
      case "urgent": return "bg-[#FF9500]";
      case "warning": return "bg-[#FF9500]/60";
      case "safe": return "bg-[#FF4444]";
      default: return "bg-[#5a7a8a]";
    }
  };

  const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => setWeekOffset((w) => w - 1)} className="hud-arrow text-[rgba(245,245,245,0.45)] hover:text-[#FF4444]">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="font-mono-data text-[11px] tracking-wide text-[#7d99aa]">
          {days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()} -{" "}
          {days[6].toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}
        </span>
        <button onClick={() => setWeekOffset((w) => w + 1)} className="hud-arrow text-[rgba(245,245,245,0.45)] hover:text-[#FF4444]">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((date, index) => {
          const dayAssignments = getDayAssignments(date);
          const count = dayAssignments.length;
          const todayFlag = isToday(date);
          const pastFlag = isPast(date);
          return (
            <button
              key={date.toISOString()}
              onClick={() => setSelectedDay(date)}
              className={`hud-timeline-day min-h-[104px] cursor-pointer p-2 text-left transition-all duration-200 ${todayFlag ? "today" : ""} ${pastFlag && !todayFlag ? "opacity-55" : ""}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className={`font-orbitron text-[10px] tracking-wider ${todayFlag ? "font-bold text-[#FF4444]" : "text-[rgba(245,245,245,0.45)]"}`}>
                  {dayNames[index]}
                </span>
                <span className={`font-mono-data text-[11px] ${todayFlag ? "font-bold text-[#FF4444]" : "text-[rgba(245,245,245,0.45)]"}`}>
                  {date.getDate()}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {count > 0 ? (
                  <>
                    {dayAssignments.slice(0, 2).map((a) => (
                      <div key={a.id} className="flex items-center gap-1">
                        <Circle className={`h-1.5 w-1.5 ${urgencyColor(getUrgency(a.dueDate))}`} fill="currentColor" />
                        <span className="font-mono-data truncate text-[9px] text-[#8aa6b7]">{a.name}</span>
                      </div>
                    ))}
                    {count > 2 && <span className="font-mono-data pl-2.5 text-[9px] text-[#7d99aa]">+{count - 2}</span>}
                  </>
                ) : (
                  <span className="font-mono-data text-[9px] text-[#5a7a8a]/50">-</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div className="mt-4 rounded-lg border border-[rgba(160,21,21,0.25)] bg-[#0a0000]/80 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-orbitron text-xs font-bold tracking-[0.15em] text-[#FF4444]">
              {selectedDay.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }).toUpperCase()}
            </h3>
            <button onClick={() => setSelectedDay(null)} className="font-mono-data text-[10px] text-[rgba(245,245,245,0.45)] transition hover:text-[#FF4444]">CLOSE</button>
          </div>
          <div className="space-y-2">
            {getDayAssignments(selectedDay).length > 0 ? (
              getDayAssignments(selectedDay).map((a) => (
                <div key={a.id} className="flex items-center gap-2">
                  <Circle className={`h-1.5 w-1.5 ${urgencyColor(getUrgency(a.dueDate))}`} fill="currentColor" />
                  <span className="font-rajdhani text-sm text-[#e8f4f8]">{a.name}</span>
                  <span className="font-mono-data ml-auto text-[10px] text-[#7d99aa]">{a.course?.name || "COURSE"}</span>
                </div>
              ))
            ) : (
              <p className="font-mono-data text-[11px] text-[#7d99aa]">NO ASSIGNMENTS SCHEDULED</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
