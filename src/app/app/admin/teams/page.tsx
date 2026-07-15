"use client";

import { useEffect, useState, useCallback } from "react";
import { Pill } from "@/components/ui/Pill";
import { ACTIVE_STATE_COLORS, colorFor } from "@/lib/ui/colors";

interface Member {
  userId: string;
  name: string;
}
interface Team {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  isDefault: boolean;
  memberCount: number;
  members: Member[];
}
interface User {
  id: string;
  name: string;
  email: string;
}

export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // local edit-name buffers keyed by team id
  const [editName, setEditName] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tRes, uRes] = await Promise.all([
        fetch("/api/admin/teams"),
        fetch("/api/admin/users"),
      ]);
      if (!tRes.ok) throw new Error((await tRes.json()).error ?? "Failed to load teams");
      const tData = await tRes.json();
      const uData = uRes.ok ? await uRes.json() : { users: [] };
      setTeams(tData.teams ?? []);
      setUsers(uData.users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createTeam(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, description: newDesc || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Create failed");
      setNewName("");
      setNewDesc("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function patchTeam(teamId: string, body: Record<string, unknown>) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Action failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <form
        onSubmit={createTeam}
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2 className="mb-3 text-sm font-semibold">Create team</h2>
        <div className="flex flex-wrap items-end gap-2">
          <input
            required
            placeholder="Team name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <input
            placeholder="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="min-w-64 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create team"}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : teams.length === 0 ? (
        <p className="text-slate-500">No teams yet.</p>
      ) : (
        <div className="space-y-4">
          {teams.map((team) => {
            const memberIds = new Set(team.members.map((m) => m.userId));
            const available = users.filter((u) => !memberIds.has(u.id));
            return (
              <div
                key={team.id}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={editName[team.id] ?? team.name}
                    onChange={(e) =>
                      setEditName((m) => ({ ...m, [team.id]: e.target.value }))
                    }
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm font-medium"
                  />
                  <button
                    onClick={() =>
                      patchTeam(team.id, {
                        action: "edit",
                        name: editName[team.id] ?? team.name,
                      })
                    }
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                  >
                    Save name
                  </button>
                  {team.isDefault && (
                    <span className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-600/20">
                      default
                    </span>
                  )}
                  <Pill color={colorFor(ACTIVE_STATE_COLORS, team.status)} withDot>
                    {team.status}
                  </Pill>
                  <span className="text-xs text-slate-400">
                    {team.memberCount} member{team.memberCount === 1 ? "" : "s"}
                  </span>
                  <button
                    onClick={() => patchTeam(team.id, { action: "archive" })}
                    className="ml-auto rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                  >
                    Archive
                  </button>
                </div>

                {team.description && (
                  <p className="mt-1 text-sm text-slate-500">{team.description}</p>
                )}

                <div className="mt-3">
                  <div className="mb-1 text-xs font-semibold text-slate-500">
                    Members
                  </div>
                  <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                    {team.members.length === 0 && (
                      <li className="px-3 py-2 text-xs text-slate-400">
                        No members.
                      </li>
                    )}
                    {team.members.map((m) => (
                      <li
                        key={m.userId}
                        className="flex items-center justify-between px-3 py-1.5 text-sm"
                      >
                        <span>{m.name}</span>
                        <button
                          onClick={() =>
                            patchTeam(team.id, {
                              action: "removeMember",
                              userId: m.userId,
                            })
                          }
                          className="rounded-md border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-2">
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value)
                          patchTeam(team.id, {
                            action: "addMember",
                            userId: e.target.value,
                          });
                        e.target.value = "";
                      }}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    >
                      <option value="">Add member…</option>
                      {available.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
