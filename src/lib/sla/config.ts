import type { Tx } from "@/lib/db";

/** Default priority-based SLA policies (master spec §15.3). Calendar minutes (ADR-9). */
const DEFAULT_POLICIES: {
  name: string;
  priority: "p1" | "p2" | "p3" | "p4";
  firstResponseMinutes: number;
  resolutionMinutes: number;
}[] = [
  { name: "P1 Critical", priority: "p1", firstResponseMinutes: 15, resolutionMinutes: 240 },
  { name: "P2 High", priority: "p2", firstResponseMinutes: 60, resolutionMinutes: 480 },
  { name: "P3 Medium", priority: "p3", firstResponseMinutes: 240, resolutionMinutes: 4320 },
  { name: "P4 Low", priority: "p4", firstResponseMinutes: 480, resolutionMinutes: 7200 },
];

const DEFAULT_WEEK = {
  mon: [["09:00", "17:00"]], tue: [["09:00", "17:00"]], wed: [["09:00", "17:00"]],
  thu: [["09:00", "17:00"]], fri: [["09:00", "17:00"]], sat: [], sun: [],
};

/**
 * Seeds default SLA policies + a default business-hours row (the latter is stored but
 * NOT consulted by MVP timer math — calendar time, ADR-9). Runs inside a withTenant tx.
 */
export async function seedTenantSla(tx: Tx, tenantId: string): Promise<void> {
  await tx.sLAPolicy.createMany({
    data: DEFAULT_POLICIES.map((p) => ({
      tenantId, name: p.name, priority: p.priority,
      firstResponseMinutes: p.firstResponseMinutes, resolutionMinutes: p.resolutionMinutes,
    })),
  });
  await tx.businessHours.create({
    data: { tenantId, name: "Default (9–5, Mon–Fri)", timezone: "UTC", weeklySchedule: DEFAULT_WEEK, isDefault: true },
  });
}
