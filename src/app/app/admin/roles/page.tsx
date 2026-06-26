"use client";

import { useEffect, useState, useCallback } from "react";

interface Role {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  scope?: string;
  permissions: string[];
}
interface Permission {
  key: string;
  description: string;
  category: string;
}

export default function AdminRolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // create form
  const [newName, setNewName] = useState("");
  const [newPerms, setNewPerms] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  // editing a custom role's permissions: id -> Set
  const [editPerms, setEditPerms] = useState<Record<string, Set<string>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rRes, pRes] = await Promise.all([
        fetch("/api/admin/roles"),
        fetch("/api/admin/permissions"),
      ]);
      if (!rRes.ok) throw new Error((await rRes.json()).error ?? "Failed to load roles");
      const rData = await rRes.json();
      const pData = pRes.ok ? await pRes.json() : { permissions: [] };
      setRoles(rData.roles ?? []);
      setPermissions(pData.permissions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  async function createRole(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          permissionKeys: Array.from(newPerms),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Create failed");
      setNewName("");
      setNewPerms(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function patchRole(roleId: string, body: Record<string, unknown>) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/roles/${roleId}`, {
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

  function permsFor(role: Role): Set<string> {
    return editPerms[role.id] ?? new Set(role.permissions);
  }

  function toggleEditPerm(role: Role, key: string) {
    setEditPerms((m) => {
      const current = new Set(m[role.id] ?? role.permissions);
      if (current.has(key)) current.delete(key);
      else current.add(key);
      return { ...m, [role.id]: current };
    });
  }

  const systemRoles = roles.filter((r) => r.isSystem);
  const customRoles = roles.filter((r) => !r.isSystem);

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* System roles */}
      <div>
        <h2 className="mb-2 text-lg font-semibold">System roles</h2>
        {loading ? (
          <p className="text-slate-500">Loading…</p>
        ) : (
          <div className="space-y-3">
            {systemRoles.map((role) => (
              <div
                key={role.id}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{role.name}</span>
                  <span className="inline-block rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                    system
                  </span>
                  <button
                    onClick={() =>
                      patchRole(role.id, {
                        cloneFrom: role.id,
                        name: `${role.name} (copy)`,
                      })
                    }
                    className="ml-auto rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                  >
                    Clone
                  </button>
                </div>
                {role.description && (
                  <p className="mt-1 text-sm text-slate-500">{role.description}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  {role.permissions.length === 0 && (
                    <span className="text-xs text-slate-400">No permissions.</span>
                  )}
                  {role.permissions.map((p) => (
                    <span
                      key={p}
                      className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Custom roles */}
      <div>
        <h2 className="mb-2 text-lg font-semibold">Custom roles</h2>
        {!loading && customRoles.length === 0 ? (
          <p className="text-slate-500">No custom roles yet.</p>
        ) : (
          <div className="space-y-3">
            {customRoles.map((role) => {
              const selected = permsFor(role);
              return (
                <div
                  key={role.id}
                  className="rounded-lg border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{role.name}</span>
                    <button
                      onClick={() =>
                        patchRole(role.id, {
                          permissionKeys: Array.from(selected),
                        })
                      }
                      className="ml-auto rounded-md bg-brand px-2 py-1 text-xs font-medium text-brand-fg hover:opacity-90"
                    >
                      Save permissions
                    </button>
                  </div>
                  {role.description && (
                    <p className="mt-1 text-sm text-slate-500">
                      {role.description}
                    </p>
                  )}
                  <div className="mt-3 space-y-3">
                    {Object.entries(grouped).map(([category, perms]) => (
                      <div key={category}>
                        <div className="mb-1 text-xs font-semibold uppercase text-slate-500">
                          {category}
                        </div>
                        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                          {perms.map((p) => (
                            <label
                              key={p.key}
                              className="flex items-center gap-2 text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={selected.has(p.key)}
                                onChange={() => toggleEditPerm(role, p.key)}
                              />
                              <span>{p.description || p.key}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create role */}
      <form
        onSubmit={createRole}
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2 className="mb-3 text-sm font-semibold">Create role</h2>
        <input
          required
          placeholder="Role name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="mb-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <div className="space-y-3">
          {Object.entries(grouped).map(([category, perms]) => (
            <div key={category}>
              <div className="mb-1 text-xs font-semibold uppercase text-slate-500">
                {category}
              </div>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {perms.map((p) => (
                  <label key={p.key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newPerms.has(p.key)}
                      onChange={() =>
                        setNewPerms((s) => {
                          const next = new Set(s);
                          if (next.has(p.key)) next.delete(p.key);
                          else next.add(p.key);
                          return next;
                        })
                      }
                    />
                    <span>{p.description || p.key}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button
          type="submit"
          disabled={creating}
          className="mt-3 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create role"}
        </button>
      </form>
    </div>
  );
}
