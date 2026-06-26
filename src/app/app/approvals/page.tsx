"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface Approval {
  id: string;
  sequence: number;
  ticket: {
    id: string;
    ticketNumber: string;
    title: string;
    teamId: string;
  } | null;
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/approvals");
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load approvals");
      const data = await res.json();
      setApprovals(data.approvals ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: string, decision: "approve" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      const body: { comment?: string } = {};
      if (decision === "reject") {
        const comment = window.prompt("Reason for rejection (optional):") ?? undefined;
        if (comment) body.comment = comment;
      }
      const res = await fetch(`/api/approvals/${id}/${decision}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Action failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Approvals</h1>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : approvals.length === 0 ? (
        <p className="text-slate-500">No pending approvals.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {approvals.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">
                    {a.ticket ? (
                      <Link href={`/app/tickets/${a.ticket.id}`} className="hover:underline">
                        {a.ticket.ticketNumber}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {a.ticket ? (
                      <Link
                        href={`/app/tickets/${a.ticket.id}`}
                        className="font-medium hover:underline"
                      >
                        {a.ticket.title}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => decide(a.id, "approve")}
                        disabled={busyId === a.id}
                        className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => decide(a.id, "reject")}
                        disabled={busyId === a.id}
                        className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
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
