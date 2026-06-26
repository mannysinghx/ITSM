import type { Tx } from "@/lib/db";

/**
 * Canonical ticket configuration (master spec §11). Seeded per-tenant into the
 * config FK tables (ADR-5), read-only in MVP, editable in Phase 3. Severity/priority
 * use the Prisma enum string values.
 */

type Sev = "low" | "medium" | "high" | "critical";
type Prio = "p1" | "p2" | "p3" | "p4";
type StatusCat = "open" | "pending" | "resolved" | "closed" | "cancelled";

export const STATUSES: {
  key: string;
  name: string;
  category: StatusCat;
  order: number;
  isDefault?: boolean;
}[] = [
  { key: "new", name: "New", category: "open", order: 0, isDefault: true },
  { key: "triaged", name: "Triaged", category: "open", order: 1 },
  { key: "assigned", name: "Assigned", category: "open", order: 2 },
  { key: "in_progress", name: "In Progress", category: "open", order: 3 },
  { key: "waiting_on_requester", name: "Waiting on Requester", category: "pending", order: 4 },
  { key: "waiting_on_vendor", name: "Waiting on Vendor", category: "pending", order: 5 },
  { key: "waiting_on_approval", name: "Waiting on Approval", category: "pending", order: 6 },
  { key: "pending_change", name: "Pending Change", category: "pending", order: 7 },
  { key: "resolved", name: "Resolved", category: "resolved", order: 8 },
  { key: "closed", name: "Closed", category: "closed", order: 9 },
  { key: "cancelled", name: "Cancelled", category: "cancelled", order: 10 },
  { key: "reopened", name: "Reopened", category: "open", order: 11 },
];

export const DEFAULT_STATUS_KEY = "new";
export const RESOLVED_STATUS_KEY = "resolved";
export const CLOSED_STATUS_KEY = "closed";
export const REOPENED_STATUS_KEY = "reopened";

export const TYPES: { key: string; name: string }[] = [
  { key: "incident", name: "Incident" },
  { key: "service_request", name: "Service Request" },
  { key: "task", name: "Task" },
  { key: "problem", name: "Problem" },
  { key: "change", name: "Change" },
  { key: "alert", name: "Alert" },
  { key: "question", name: "Question" },
  { key: "access_request", name: "Access Request" },
  { key: "procurement_request", name: "Procurement Request" },
  { key: "onboarding_request", name: "Onboarding Request" },
  { key: "offboarding_request", name: "Offboarding Request" },
  { key: "security_event", name: "Security Event" },
];

export const DEFAULT_TYPE_KEY = "incident";

// Impact (rows) × Urgency (cols) → priority (master spec §11.4). Crit+Crit=P1,
// High+High=P2, Low+Low=P4.
const MATRIX: Record<Sev, Record<Sev, Prio>> = {
  low:      { low: "p4", medium: "p4", high: "p3", critical: "p3" },
  medium:   { low: "p4", medium: "p3", high: "p3", critical: "p2" },
  high:     { low: "p3", medium: "p3", high: "p2", critical: "p1" },
  critical: { low: "p3", medium: "p2", high: "p1", critical: "p1" },
};

const SEVERITIES: Sev[] = ["low", "medium", "high", "critical"];

export function matrixEntries(): { impact: Sev; urgency: Sev; priority: Prio }[] {
  const out: { impact: Sev; urgency: Sev; priority: Prio }[] = [];
  for (const impact of SEVERITIES) {
    for (const urgency of SEVERITIES) {
      out.push({ impact, urgency, priority: MATRIX[impact][urgency] });
    }
  }
  return out;
}

export const CATEGORIES = ["Hardware", "Software", "Network", "Access", "Email", "Security"];

/**
 * Seeds the config FK tables for one tenant. Must run inside a `withTenant`
 * transaction (RLS WITH CHECK relies on the active tenant context). Idempotent via
 * skipDuplicates on the unique keys.
 */
export async function seedTenantConfig(tx: Tx, tenantId: string): Promise<void> {
  await tx.ticketStatus.createMany({
    data: STATUSES.map((s) => ({
      tenantId,
      key: s.key,
      name: s.name,
      category: s.category,
      order: s.order,
      isDefault: s.isDefault ?? false,
    })),
    skipDuplicates: true,
  });

  await tx.ticketType.createMany({
    data: TYPES.map((t) => ({ tenantId, key: t.key, name: t.name })),
    skipDuplicates: true,
  });

  await tx.priorityMatrixEntry.createMany({
    data: matrixEntries().map((m) => ({ tenantId, ...m })),
    skipDuplicates: true,
  });

  await tx.category.createMany({
    data: CATEGORIES.map((name) => ({ tenantId, name })),
    skipDuplicates: true,
  });
}
