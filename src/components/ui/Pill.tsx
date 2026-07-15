import type { ColorToken } from "@/lib/ui/colors";

export function Pill({
  children,
  color,
  withDot = false,
}: {
  children: React.ReactNode;
  color: ColorToken;
  withDot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${color.pill}`}
    >
      {withDot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color.dot}`} />}
      {children}
    </span>
  );
}
