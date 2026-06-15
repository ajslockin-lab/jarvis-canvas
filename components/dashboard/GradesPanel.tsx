"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Grade {
  name: string;
  percent: number;
  trend?: "up" | "down" | "same";
  change?: number;
}

interface GradesPanelProps {
  grades: Grade[];
}

export default function GradesPanel({ grades }: GradesPanelProps) {
  const getBarColor = (percent: number) => {
    if (percent >= 85) return "#00FF88";
    if (percent >= 70) return "#FF9500";
    return "#FF4D4D";
  };

  const getLetterGrade = (percent: number) => {
    if (percent >= 90) return "A";
    if (percent >= 80) return "B";
    if (percent >= 70) return "C";
    if (percent >= 60) return "D";
    return "F";
  };

  const getBadgeClass = (percent: number) => {
    if (percent >= 85) return "hud-badge-green";
    if (percent >= 70) return "hud-badge-amber";
    return "hud-badge-red";
  };

  return (
    <div className="space-y-4">
      {grades.length === 0 ? (
        <div className="text-center py-6">
          <p className="font-orbitron text-[11px] text-[#5a7a8a] tracking-wider">NO DATA AVAILABLE</p>
          <p className="font-mono-data text-[10px] text-[#5a7a8a] mt-1">CONNECT CANVAS TO INITIALIZE</p>
        </div>
      ) : (
        grades.map((g) => (
          <div key={g.name} className="group">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-orbitron text-[12px] text-[#e8f4f8] tracking-wide">{g.name.toUpperCase()}</span>
                {g.trend === "up" && (
                  <TrendingUp className="w-3 h-3 text-[#00FF88]" />
                )}
                {g.trend === "down" && (
                  <TrendingDown className="w-3 h-3 text-[#FF4D4D]" />
                )}
                {g.trend === "same" && (
                  <Minus className="w-3 h-3 text-[#5a7a8a]" />
                )}
                {g.change !== undefined && g.change !== 0 && (
                  <span className={`font-mono-data text-[10px] ${g.change > 0 ? "text-[#00FF88]" : "text-[#FF4D4D]"}`}>
                    {g.change > 0 ? "+" : ""}{g.change}%
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono-data text-xl font-bold text-[#e8f4f8]">
                  {g.percent}
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 ${getBadgeClass(g.percent)}`}>
                  {getLetterGrade(g.percent)}
                </span>
              </div>
            </div>
            <div className="hud-bar-track">
              <div
                className="hud-bar-fill"
                style={{
                  width: `${Math.min(g.percent, 100)}%`,
                  background: getBarColor(g.percent),
                }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
}
