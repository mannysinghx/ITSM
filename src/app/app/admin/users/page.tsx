"use client";

import { useEffect, useState, useCallback } from "react";

interface Team {
  id: string;
  name: string;
}
interface Role {
  id: string;
  key?: string;
  name: string;
  isSystem?: boolean;
}
interface User {
  id: string;
  name: string;
  email: string;
  status: string;
  membershipStatus: string;
  teams: { id: string; name: string }[];
  roles: { key: string; name: string }[];
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // invite form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");
  const [inviteTeamId, setInviteTeamId] = useState("");
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [uRes, rRes, tRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/roles"),
        fetch("/api/admin/teams"),
      ]);
      if (!uRes.ok) throw new Error((await uRes.json()).error ?? "Failed to load users");
      const uData = await uRes.json();
      const rData = rRes.ok ? await rRes.json() : { roles: [] };
      const tData = tRes.ok ? await tRes.json() : { teams: [] };
      setUsers(uData.users ?? []);
      setRoles(rData.roles ?? []);
      setTeams(tData.teams ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          roleId: inviteRoleId || undefined,
          teamId: inviteTeamId || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Invite failed");
      setName("");
      setEmail("");
      setInviteRoleId("");
      setInviteTeamId("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setInviting(false);
    }
  }

  async function patchUser(userId: string, body: Record<string, unknown>) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
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
        onSubmit={invite}
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2 className="mb-3 text-sm font-semibold">Invite user</h2>
        <div className="flex flex-wrap items-end gap-2">
          <input
            required
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <input
            required
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <select
            value={inviteRoleId}
            onChange={(e) => setInviteRoleId(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Role (optional)</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            value={inviteTeamId}
            onChange={(e) => setInviteTeamId(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Team (optional)</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={inviting}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
          >
            {inviting ? "Inviting…" : "Invite user"}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-slate-500">No users yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Teams</th>
                <th className="px-3 py-2 font-medium">Roles</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const suspended = u.membershipStatus === "suspended";
                return (
                  <tr key={u.id} className="hover:bg-slate-50 align-top">
                    <td className="px-3 py-2 font-medium">{u.name}</td>
                    <td className="px-3 py-2 text-slate-600">{u.email}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                        {u.membershipStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {u.teams.length ? u.teams.map((t) => t.name).join(", ") : "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {u.roles.length ? u.roles.map((r) => r.name).join(", ") : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() =>
                            patchUser(u.id, {
                              action: suspended ? "reactivate" : "suspend",
                            })
                          }
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                        >
                          {suspended ? "Reactivate" : "Suspend"}
                        </button>
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value)
                              patchUser(u.id, {
                                action: "assignRole",
                                roleId: e.target.value,
                              });
                            e.target.value = "";
                          }}
                          className="rounded-md border border-slate-300 px-1.5 py-1 text-xs"
                        >
                          <option value="">Assign role…</option>
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value)
                              patchUser(u.id, {
                                action: "assignTeam",
                                teamId: e.target.value,
                              });
                            e.target.value = "";
                          }}
                          className="rounded-md border border-slate-300 px-1.5 py-1 text-xs"
                        >
                          <option value="">Assign team…</option>
                          {teams.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
