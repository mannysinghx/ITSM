"use client";

import { useCallback, useEffect, useState } from "react";

type PlanKey = "free" | "team" | "company" | "enterprise";

interface Billing {
  plan: string;
  status: string;
  limits: {
    users: number;
    teams: number;
    tickets: number;
    integrations: number;
    aiTokens: number;
  };
  usage: {
    users: number;
    teams: number;
    tickets: number;
    integrations: number;
  };
}

const PLANS: PlanKey[] = ["free", "team", "company", "enterprise"];

const USAGE_ROWS: { key: keyof Billing["usage"]; label: string }[] = [
  { key: "users", label: "Users" },
  { key: "teams", label: "Teams" },
  { key: "tickets", label: "Tickets" },
  { key: "integrations", label: "Integrations" },
];

export default function AdminBillingPage() {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPlan, setSelectedPlan] = useState<PlanKey>("free");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/billing");
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load billing");
      const data: Billing = await res.json();
      setBilling(data);
      if (PLANS.includes(data.plan as PlanKey)) setSelectedPlan(data.plan as PlanKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function changePlan(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/admin/billing/plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Plan change failed");
      setSaved(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Plan change failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (!billing) return <p className="text-sm text-red-600">{error ?? "No billing data."}</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Billing & Plan</h1>
        <p className="mt-1 text-sm text-slate-500">
          Plan limits are enforced on create paths (users, teams, tickets, integrations).
          Payment processing is handled externally (not in this release).
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">Plan updated.</p>}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold">Current plan</h2>
        <div className="flex items-center gap-2">
          <span className="inline-block rounded bg-brand px-2 py-0.5 text-xs font-medium text-brand-fg">
            {billing.plan}
          </span>
          <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
            {billing.status}
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Resource</th>
              <th className="px-3 py-2 font-medium">Used / Limit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {USAGE_ROWS.map((row) => {
              const used = billing.usage[row.key];
              const limit = billing.limits[row.key];
              const unlimited = limit === -1;
              const atLimit = !unlimited && used >= limit;
              return (
                <tr key={row.key} className={atLimit ? "bg-amber-50" : ""}>
                  <td className="px-3 py-2 font-medium">{row.label}</td>
                  <td
                    className={`px-3 py-2 ${atLimit ? "font-medium text-red-600" : "text-slate-600"}`}
                  >
                    {used} / {unlimited ? "Unlimited" : limit}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={changePlan}
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2 className="mb-3 text-sm font-semibold">Change plan</h2>
        <div className="flex flex-wrap items-end gap-2">
          <select
            value={selectedPlan}
            onChange={(e) => setSelectedPlan(e.target.value as PlanKey)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Change plan"}
          </button>
        </div>
      </form>
    </div>
  );
}
