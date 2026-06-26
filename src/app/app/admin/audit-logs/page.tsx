"use client";

import { useEffect, useState, useCallback } from "react";

interface Log {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorName: string;
  createdAt: string;
  metadata?: unknown;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (action) params.set("action", action);
      if (entityType) params.set("entityType", entityType);
      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load logs");
      const data = await res.json();
      setLogs(data.logs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [action, entityType]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <input
          placeholder="Filter by action…"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <input
          placeholder="Filter by entity type…"
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        {(action || entityType) && (
          <button
            onClick={() => {
              setAction("");
              setEntityType("");
            }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : logs.length === 0 ? (
        <p className="text-slate-500">No audit logs match.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Timestamp</th>
                <th className="px-3 py-2 font-medium">Actor</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Entity type</th>
                <th className="px-3 py-2 font-medium">Entity ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-500">
                    {new Date(l.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{l.actorName}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-700">
                    {l.action}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{l.entityType}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">
                    {l.entityId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
