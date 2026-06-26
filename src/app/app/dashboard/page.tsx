import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

export default async function DashboardPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const data = await withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const [tenant, teamCount, memberCount] = await Promise.all([
      tx.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: { name: true, type: true, plan: true },
      }),
      tx.team.count(),
      tx.tenantMembership.count(),
    ]);
    const teams = await tx.team.findMany({
      select: { id: true, name: true, isDefault: true },
      orderBy: { createdAt: "asc" },
    });
    return { tenant, teamCount, memberCount, teams };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{data.tenant?.name}</h1>
        <p className="text-slate-500">
          {data.tenant?.type === "company" ? "Company" : "Individual"} workspace ·{" "}
          {data.tenant?.plan} plan
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card label="Teams" value={data.teamCount} />
        <Card label="Members" value={data.memberCount} />
        <Card label="Your teams" value={ctx.teamIds.length} />
        <Card label="Permissions" value={ctx.permissionKeys.size} />
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Teams</h2>
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {data.teams.map((t) => (
            <li key={t.id} className="flex items-center justify-between px-4 py-3">
              <span>{t.name}</span>
              {t.isDefault && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  default
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-sm text-slate-400">
        Phase 1 foundation. Tickets, tasks, and admin arrive in later phases.
      </p>
    </div>
  );
}
