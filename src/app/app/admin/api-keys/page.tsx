"use client";

import { useEffect, useState, useCallback } from "react";
import { Pill } from "@/components/ui/Pill";
import { ACTIVE_STATE_COLORS, colorFor } from "@/lib/ui/colors";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export default function AdminApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // create form state
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState("");
  const [creating, setCreating] = useState(false);

  // the freshly-created secret, shown once
  const [newKey, setNewKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/api-keys");
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load API keys");
      const data = await res.json();
      setKeys(data.keys ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const scopeList = scopes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scopes: scopeList }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create API key");
      const data = await res.json();
      setNewKey(data.key ?? null);
      setName("");
      setScopes("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create API key");
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/api-keys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to revoke API key");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke API key");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">API Keys</h1>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {newKey && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-semibold text-amber-800">
            Copy this key now — it will not be shown again.
          </p>
          <code className="block break-all rounded-md border border-amber-200 bg-white px-3 py-2 font-mono text-sm text-slate-800">
            {newKey}
          </code>
          <p className="mt-2 text-xs text-amber-700">
            This secret is not stored. Once you dismiss this box it is gone.
          </p>
          <button
            onClick={() => setNewKey(null)}
            className="mt-3 rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
          >
            Dismiss
          </button>
        </div>
      )}

      <form onSubmit={createKey} className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Create API key</h2>
        <div className="flex flex-wrap items-end gap-2">
          <input
            required
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <input
            placeholder="Scopes (ticket.read,ticket.write or *)"
            value={scopes}
            onChange={(e) => setScopes(e.target.value)}
            className="min-w-[18rem] flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create API key"}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : keys.length === 0 ? (
        <p className="text-slate-500">No API keys yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Prefix</th>
                <th className="px-3 py-2 font-medium">Scopes</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Last used</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {keys.map((k) => {
                const revoked = !!k.revokedAt;
                return (
                  <tr key={k.id} className="align-top hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{k.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">{k.prefix}…</td>
                    <td className="px-3 py-2 text-slate-600">
                      {k.scopes.length ? k.scopes.join(", ") : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Pill color={colorFor(ACTIVE_STATE_COLORS, revoked ? "revoked" : "active")} withDot>
                        {revoked ? "Revoked" : "Active"}
                      </Pill>
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {!revoked && (
                        <button
                          onClick={() => revokeKey(k.id)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-red-600 hover:bg-slate-50"
                        >
                          Revoke
                        </button>
                      )}
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
