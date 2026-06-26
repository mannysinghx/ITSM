"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PriorityBadge, StatusBadge } from "@/components/tickets/badges";

interface Row {
  id: string;
  ticketNumber: string;
  title: string;
  priority: string;
  status: { key: string; name: string; category: string };
  type: { name: string };
  team: { name: string };
  requester: { name: string } | null;
  assignee: { name: string } | null;
}

interface Meta {
  types: { key: string; name: string }[];
  statuses: { key: string; name: string; category: string; order: number }[];
}

export function TicketQueue() {
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [view, setView] = useState<"table" | "kanban">("table");
  const [filters, setFilters] = useState<{ status?: string; type?: string; priority?: string; q?: string }>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    const res = await fetch(`/api/tickets?${params.toString()}`);
    const data = await res.json();
    setRows(data.tickets ?? []);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    fetch("/api/tickets/meta").then((r) => r.json()).then(setMeta);
  }, []);
  useEffect(() => { load(); }, [load]);

  const kanbanCols = meta?.statuses
    .filter((s) => ["open", "pending", "resolved"].includes(s.category))
    .slice(0, 6) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          placeholder="Search number or title…"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value || undefined }))}
        />
        <select
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined }))}
        >
          <option value="">All statuses</option>
          {meta?.statuses.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
        </select>
        <select
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value || undefined }))}
        >
          <option value="">All priorities</option>
          {["p1", "p2", "p3", "p4"].map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
        </select>
        <select
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value || undefined }))}
        >
          <option value="">All types</option>
          {meta?.types.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setView(view === "table" ? "kanban" : "table")}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-white"
          >
            {view === "table" ? "Kanban view" : "Table view"}
          </button>
          <Link
            href="/app/tickets/new"
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90"
          >
            New ticket
          </Link>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Note: custom fields are stored but not filterable in this release.
      </p>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-slate-500">No tickets match.</p>
      ) : view === "table" ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Priority</th>
                <th className="px-3 py-2 font-medium">Team</th>
                <th className="px-3 py-2 font-medium">Assignee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">
                    <Link href={`/app/tickets/${t.id}`} className="hover:underline">
                      {t.ticketNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/app/tickets/${t.id}`} className="font-medium hover:underline">
                      {t.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge name={t.status.name} category={t.status.category} />
                  </td>
                  <td className="px-3 py-2"><PriorityBadge priority={t.priority} /></td>
                  <td className="px-3 py-2 text-slate-600">{t.team.name}</td>
                  <td className="px-3 py-2 text-slate-600">{t.assignee?.name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {kanbanCols.map((col) => (
            <div key={col.key} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <div className="mb-2 px-1 text-xs font-semibold text-slate-500">{col.name}</div>
              <div className="space-y-2">
                {rows.filter((r) => r.status.key === col.key).map((t) => (
                  <Link
                    key={t.id}
                    href={`/app/tickets/${t.id}`}
                    className="block rounded-md border border-slate-200 bg-white p-2 text-sm hover:border-brand"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-slate-400">{t.ticketNumber}</span>
                      <PriorityBadge priority={t.priority} />
                    </div>
                    <div className="mt-1 line-clamp-2">{t.title}</div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
