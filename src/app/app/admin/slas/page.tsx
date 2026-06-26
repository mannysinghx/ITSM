"use client";

import { useEffect, useState, useCallback } from "react";

interface Policy {
  id: string;
  name: string;
  description: string | null;
  teamId: string | null;
  ticketType: string | null;
  priority: string | null;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  enabled: boolean;
}

interface TicketType {
  key: string;
  name: string;
}

interface Team {
  id: string;
  name: string;
}

export default function AdminSlasPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [types, setTypes] = useState<TicketType[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // create form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ticketType, setTicketType] = useState("");
  const [priority, setPriority] = useState("");
  const [teamId, setTeamId] = useState("");
  const [firstResponseMinutes, setFirstResponseMinutes] = useState("");
  const [resolutionMinutes, setResolutionMinutes] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, tRes, teamRes] = await Promise.all([
        fetch("/api/admin/config/slas"),
        fetch("/api/admin/config/tickets"),
        fetch("/api/admin/teams"),
      ]);
      if (!pRes.ok) throw new Error((await pRes.json()).error ?? "Failed to load policies");
      const pData = await pRes.json();
      const tData = tRes.ok ? await tRes.json() : { types: [] };
      const teamData = teamRes.ok ? await teamRes.json() : { teams: [] };
      setPolicies(pData.policies ?? []);
      setTypes(tData.types ?? []);
      setTeams(teamData.teams ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function typeName(key: string | null): string {
    if (!key) return "Any";
    return types.find((t) => t.key === key)?.name ?? key;
  }

  function teamName(id: string | null): string {
    if (!id) return "Any";
    return teams.find((t) => t.id === id)?.name ?? id;
  }

  function matchLabel(p: Policy): string {
    const parts = [
      typeName(p.ticketType),
      p.priority ? p.priority.toUpperCase() : "Any",
      teamName(p.teamId),
    ];
    return parts.join(" / ");
  }

  async function createPolicy(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/config/slas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          ticketType: ticketType || null,
          priority: priority || null,
          teamId: teamId || null,
          firstResponseMinutes: Number(firstResponseMinutes),
          resolutionMinutes: Number(resolutionMinutes),
          enabled,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create policy");
      setName("");
      setDescription("");
      setTicketType("");
      setPriority("");
      setTeamId("");
      setFirstResponseMinutes("");
      setResolutionMinutes("");
      setEnabled(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create policy");
    } finally {
      setCreating(false);
    }
  }

  async function patchPolicy(id: string, body: Record<string, unknown>) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/config/slas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to update policy");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update policy");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">SLA Policies</h1>

      <p className="text-xs text-slate-400">
        SLAs use calendar time; business-hours / holiday math is deferred (a later phase).
        Editing the matrix or a policy applies to future tickets only.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <form onSubmit={createPolicy} className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Create SLA policy</h2>
        <div className="flex flex-wrap items-end gap-2">
          <input
            required
            placeholder="Policy name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <input
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-w-[14rem] flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <select
            value={ticketType}
            onChange={(e) => setTicketType(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Any type</option>
            {types.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Any priority</option>
            {["p1", "p2", "p3", "p4"].map((p) => (
              <option key={p} value={p}>
                {p.toUpperCase()}
              </option>
            ))}
          </select>
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Any team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <input
            required
            type="number"
            min={1}
            step={1}
            placeholder="First response (min)"
            value={firstResponseMinutes}
            onChange={(e) => setFirstResponseMinutes(e.target.value)}
            className="w-40 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <input
            required
            type="number"
            min={1}
            step={1}
            placeholder="Resolution (min)"
            value={resolutionMinutes}
            onChange={(e) => setResolutionMinutes(e.target.value)}
            className="w-40 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded border-slate-300"
            />
            Enabled
          </label>
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create SLA policy"}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : policies.length === 0 ? (
        <p className="text-slate-500">No SLA policies yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Match (type / priority / team)</th>
                <th className="px-3 py-2 font-medium">First response (min)</th>
                <th className="px-3 py-2 font-medium">Resolution (min)</th>
                <th className="px-3 py-2 font-medium">Enabled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {policies.map((p) => (
                <tr key={p.id} className="align-top hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="font-medium">{p.name}</div>
                    {p.description && (
                      <div className="text-xs text-slate-400">{p.description}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{matchLabel(p)}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      defaultValue={p.firstResponseMinutes}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isInteger(v) && v > 0 && v !== p.firstResponseMinutes)
                          patchPolicy(p.id, { firstResponseMinutes: v });
                      }}
                      className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      defaultValue={p.resolutionMinutes}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isInteger(v) && v > 0 && v !== p.resolutionMinutes)
                          patchPolicy(p.id, { resolutionMinutes: v });
                      }}
                      className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => patchPolicy(p.id, { enabled: !p.enabled })}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                    >
                      {p.enabled ? "Enabled" : "Disabled"}
                    </button>
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
