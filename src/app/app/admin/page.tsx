import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { getAdminOverview } from "@/lib/admin/audit";

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
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
        <Card label="Users" value={data.userCount} />
        <Card label="Teams" value={data.teamCount} />
        <Card label="Tickets" value={data.ticketCount} />
        <Card label="Plan" value={data.tenant?.plan ?? "—"} />
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Recent activity</h2>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
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
