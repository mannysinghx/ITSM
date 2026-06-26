import type { Tx } from "@/lib/db";
import type { Priority } from "@prisma/client";

export interface PolicyMatchInput {
  ticketType: string; // type key
  priority: Priority;
  teamId: string;
}

/**
 * Resolves the SLA policy for a ticket. NULL match-fields are wildcards; the
 * most-specific enabled policy wins (more non-null matching fields = more specific),
 * ties broken by most recently created. Returns null if nothing matches.
 */
export async function resolveSlaPolicy(tx: Tx, tenantId: string, input: PolicyMatchInput) {
  const policies = await tx.sLAPolicy.findMany({ where: { enabled: true } });

  const candidates = policies
    .filter(
      (p) =>
        (p.ticketType === null || p.ticketType === input.ticketType) &&
        (p.priority === null || p.priority === input.priority) &&
        (p.teamId === null || p.teamId === input.teamId),
    )
    .map((p) => ({
      policy: p,
      score:
        (p.ticketType !== null ? 1 : 0) +
        (p.priority !== null ? 1 : 0) +
        (p.teamId !== null ? 1 : 0),
    }));

  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) =>
      b.score - a.score || b.policy.createdAt.getTime() - a.policy.createdAt.getTime(),
  );
  return candidates[0].policy;
}
