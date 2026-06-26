"use client";

import { useEffect, useState } from "react";
import { PriorityBadge } from "@/components/tickets/badges";

type Sev = "low" | "medium" | "high" | "critical";

interface Meta {
  types: { key: string; name: string }[];
  categories: { id: string; name: string }[];
  teams: { id: string; name: string; isDefault: boolean }[];
  matrix: { impact: Sev; urgency: Sev; priority: string }[];
}

export function CreateTicketForm() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "incident",
    teamId: "",
    categoryId: "",
    impact: "medium" as Sev,
    urgency: "medium" as Sev,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/tickets/meta").then((r) => r.json()).then((m: Meta) => {
      setMeta(m);
      setForm((f) => ({
        ...f,
        teamId: m.teams.find((t) => t.isDefault)?.id ?? m.teams[0]?.id ?? "",
      }));
    });
  }, []);

  const livePriority =
    meta?.matrix.find((m) => m.impact === form.impact && m.urgency === form.urgency)?.priority ??
    "p3";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        teamId: form.teamId || undefined,
        categoryId: form.categoryId || undefined,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to create ticket");
      return;
    }
    window.location.href = `/app/tickets/${data.id}`;
  }

  const field = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm";

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-4">
      <div>
        <label className="text-sm font-medium">Title</label>
        <input
          required
          className={field}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </div>
      <div>
        <label className="text-sm font-medium">Description</label>
        <textarea
          required
          rows={5}
          className={field}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Type</label>
          <select className={field} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {meta?.types.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Team</label>
          <select className={field} value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
            {meta?.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Category</label>
          <select className={field} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">None</option>
            {meta?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-sm font-medium">Impact</label>
            <select className={field} value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value as Sev })}>
              {["low", "medium", "high", "critical"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-sm font-medium">Urgency</label>
            <select className={field} value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value as Sev })}>
              {["low", "medium", "high", "critical"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
        <span className="text-slate-500">Calculated priority:</span>
        <PriorityBadge priority={livePriority} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-brand px-4 py-2 font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create ticket"}
      </button>
    </form>
  );
}
