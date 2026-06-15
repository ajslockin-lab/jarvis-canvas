"use client";

import { useMemo } from "react";

interface Assignment {
  id: string;
  name: string;
  dueDate: Date | null;
  course?: { name: string; color?: string | null };
}

interface WeeklyCalendarProps {
  assignments: Assignment[];
}

export default function WeeklyCalendar({ assignments }: WeeklyCalendarProps) {
  const days = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());

    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      return date;
    });
  }, []);

  const getDayAssignments = (date: Date) => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    return assignments.filter((a) => {
      if (!a.dueDate) return false;
      const due = new Date(a.dueDate);
      return due >= start && due <= end;
    });
  };

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((date, i) => {
        const dayAssignments = getDayAssignments(date);
        const count = dayAssignments.length;
        const today = isToday(date);

        return (
          <div
            key={i}
            className={`p-3 rounded-xl border ${today ? "border-cyan-500/50 bg-cyan-500/5" : "border-zinc-800 bg-zinc-900/30"} min-h-[100px] flex flex-col`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-medium ${today ? "text-cyan-400" : "text-zinc-500"}`}>
                {dayNames[i]}
              </span>
              <span className={`text-xs ${today ? "text-cyan-400" : "text-zinc-600"}`}>
                {date.getDate()}
              </span>
            </div>

            <div className="flex-1 flex flex-col gap-1">
              {count > 0 ? (
                <>
                  {dayAssignments.slice(0, 2).map((a) => (
                    <div
                      key={a.id}
                      className="text-xs text-zinc-300 truncate px-1.5 py-0.5 rounded bg-zinc-800/50"
                      title={a.name}
                    >
                      {a.name}
                    </div>
                  ))}
                  {count > 2 && (
                    <span className="text-xs text-zinc-500">+{count - 2} more</span>
                  )}
                </>
              ) : (
                <span className="text-xs text-zinc-600 italic">No deadlines</span>
              )}
            </div>

            {today && (
              <div className="mt-auto pt-1">
                <div className="w-full h-0.5 bg-cyan-400 rounded-full" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
