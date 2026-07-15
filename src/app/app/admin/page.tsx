import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { getAdminOverview } from "@/lib/admin/audit";

const ACCENTS: Record<string, string> = {
  indigo: "bg-brand-500",
  sky: "bg-sky-500",
  rose: "bg-rose-500",
  emerald: "bg-emerald-500",
};

function Card({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent: keyof typeof ACCENTS;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-card">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${ACCENTS[accent]}`} />
        <div className="text-sm text-slate-500">{label}</div>
      </div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

export default async function AdminDashboard() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  const data = await getAdminOverview(ctx);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card label="Users" value={data.userCount} accent="indigo" />
        <Card label="Teams" value={data.teamCount} accent="sky" />
        <Card label="Tickets" value={data.ticketCount} accent="rose" />
        <Card label="Plan" value={data.tenant?.plan ?? "—"} accent="emerald" />
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold text-slate-900">Recent activity</h2>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm shadow-card">
          {data.recent.length === 0 && <li className="px-4 py-3 text-slate-400">No activity yet.</li>}
          {data.recent.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-4 py-2.5">
              <span className="font-mono text-xs text-slate-500">{r.action}</span>
              <span className="text-slate-400">{new Date(r.createdAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
