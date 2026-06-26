const PRIORITY_STYLE: Record<string, string> = {
  p1: "bg-red-100 text-red-800",
  p2: "bg-orange-100 text-orange-800",
  p3: "bg-amber-100 text-amber-800",
  p4: "bg-slate-100 text-slate-700",
};

const STATUS_STYLE: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  pending: "bg-purple-100 text-purple-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-slate-200 text-slate-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${
        PRIORITY_STYLE[priority] ?? "bg-slate-100 text-slate-700"
      }`}
    >
      {priority.toUpperCase()}
    </span>
  );
}

export function StatusBadge({
  name,
  category,
}: {
  name: string;
  category: string;
}) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
        STATUS_STYLE[category] ?? "bg-slate-100 text-slate-700"
      }`}
    >
      {name}
    </span>
  );
}
