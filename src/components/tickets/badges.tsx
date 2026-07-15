import { Pill } from "@/components/ui/Pill";
import {
  PRIORITY_COLORS,
  STATUS_CATEGORY_COLORS,
  TICKET_TYPE_COLORS,
  TICKET_CATEGORY_COLORS,
  colorFor,
} from "@/lib/ui/colors";

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <Pill color={colorFor(PRIORITY_COLORS, priority)} withDot>
      {priority.toUpperCase()}
    </Pill>
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
    <Pill color={colorFor(STATUS_CATEGORY_COLORS, category)} withDot>
      {name}
    </Pill>
  );
}

export function TypeBadge({ typeKey, name }: { typeKey: string; name: string }) {
  return (
    <Pill color={colorFor(TICKET_TYPE_COLORS, typeKey)} withDot>
      {name}
    </Pill>
  );
}

export function CategoryBadge({ name }: { name: string }) {
  return <Pill color={colorFor(TICKET_CATEGORY_COLORS, name)}>{name}</Pill>;
}
