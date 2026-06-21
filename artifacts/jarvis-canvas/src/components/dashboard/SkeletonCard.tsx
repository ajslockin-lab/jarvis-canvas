// Skeleton primitives for the first-run dashboard.
// Keep widths/colors consistent with the surrounding HUD style:
//   bg-[#0a0000]/50 over a hud-panel, with animate-pulse and subtle
//   border to suggest placeholders.
//
// Rationale: an empty grid reads as "broken app" within the 10s bounce window
// (NN/g). Painting the layout in skeleton form before data lands signals
// "loading" rather than "empty", and is the single cheapest activation lever.

function Bar({
  widthClass,
  heightClass = "h-3",
  extraClassName = "",
}: {
  widthClass: string;
  heightClass?: string;
  extraClassName?: string;
}) {
  return (
    <div
      className={`${heightClass} ${widthClass} rounded bg-[#1a0a0a] animate-pulse ${extraClassName}`}
    />
  );
}

export function AssignmentCardSkeleton() {
  // Matches the rough footprint of <AssignmentCard/>: a horizontal row of
  // a small course-color tag, a title line, and a due-date line.
  return (
    <div className="h-24 border border-[rgba(160,21,21,0.15)] bg-[#0a0000]/50 rounded-lg p-4 flex items-start gap-3">
      <div className="w-1 self-stretch rounded bg-[#1a0a0a] animate-pulse" />
      <div className="flex-1 space-y-2">
        <Bar widthClass="w-1/3" heightClass="h-2" />
        <Bar widthClass="w-3/4" heightClass="h-3" />
        <Bar widthClass="w-1/2" heightClass="h-2" />
      </div>
      <div className="w-12 h-12 rounded bg-[#1a0a0a] animate-pulse" />
    </div>
  );
}

export function CounterChipSkeleton() {
  // Same width as the existing DUE_TODAY / THIS_WEEK chips in the header so
  // they don't shift once data arrives.
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border border-[rgba(160,21,21,0.15)] bg-[#0a0000]/50 rounded animate-pulse">
      <div className="w-3 h-3 rounded-sm bg-[#1a0a0a]" />
      <div className="w-16 h-3 rounded bg-[#1a0a0a]" />
    </div>
  );
}

export function IntelCardSkeleton() {
  // Mirrors the size of a single ProactiveFeed alert (~64px tall).
  return (
    <div className="h-16 rounded bg-[#0A1520]/50 animate-pulse" />
  );
}

export function CourseCardSkeleton() {
  // Currently the dashboard renders assignments (not course chips) in the
  // "UPCOMING TARGETS" grid, but we expose a course-sized skeleton for the
  // section header area and any future course-tile layout.
  return (
    <div className="h-20 border border-[rgba(160,21,21,0.15)] bg-[#0a0000]/50 rounded-lg p-4 space-y-2">
      <Bar widthClass="w-1/4" heightClass="h-2" />
      <Bar widthClass="w-2/3" heightClass="h-3" />
    </div>
  );
}

// Grid helper: renders N assignment skeletons. Used by the dashboard while the
// first sync is in progress.
export function AssignmentGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <AssignmentCardSkeleton key={i} />
      ))}
    </div>
  );
}

// Inline list of intel-card skeletons for the ProactiveFeed panel.
export function IntelListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <IntelCardSkeleton key={i} />
      ))}
    </div>
  );
}
