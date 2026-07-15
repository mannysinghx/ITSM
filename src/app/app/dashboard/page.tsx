import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";

const CARD_ACCENTS: Record<string, string> = {
  indigo: "bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/20",
  sky: "bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-600/20",
  emerald: "bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-600/20",
  violet: "bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-600/20",
};

function Card({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string | number;
  accent: keyof typeof CARD_ACCENTS;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-card">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${CARD_ACCENTS[accent]}`}>
        {icon}
      </div>
      <div>
        <div className="text-sm text-slate-500">{label}</div>
        <div className="mt-0.5 text-2xl font-semibold text-slate-900">{value}</div>
      </div>
    </div>
  );
}

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d={path} />
    </svg>
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
        <Card
          label="Teams"
          value={data.teamCount}
          accent="indigo"
          icon={<Icon path="M6 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm8 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM2 16c0-2.2 1.8-4 4-4s4 1.8 4 4M10 16c0-2.2 1.8-4 4-4s4 1.8 4 4" />}
        />
        <Card
          label="Members"
          value={data.memberCount}
          accent="sky"
          icon={<Icon path="M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 7c0-3.3 2.7-6 6-6s6 2.7 6 6" />}
        />
        <Card
          label="Your teams"
          value={ctx.teamIds.length}
          accent="emerald"
          icon={<Icon path="M4 3v14M4 3h9l-2 3 2 3H4Z" />}
        />
        <Card
          label="Permissions"
          value={ctx.permissionKeys.size}
          accent="violet"
          icon={<Icon path="M10 2.7l6 2.2v4.4c0 4-2.6 6.9-6 8-3.4-1.1-6-4-6-8V4.9Z" />}
        />
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold text-slate-900">Teams</h2>
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white shadow-card">
          {data.teams.map((t) => (
            <li key={t.id} className="flex items-center justify-between px-4 py-3">
              <span>{t.name}</span>
              {t.isDefault && (
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-600/20">
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
