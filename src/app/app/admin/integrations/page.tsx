"use client";

import { useEffect, useState, useCallback } from "react";

interface Integration {
  id: string;
  kind: string;
  name: string;
  status: string;
  createdAt: string;
}

interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  lastStatus: string | null;
  lastDeliveryAt: string | null;
}

const KINDS = ["slack", "teams", "email", "webhook", "github", "jira"];

export default function AdminIntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // integration form state
  const [kind, setKind] = useState(KINDS[0]);
  const [name, setName] = useState("");
  const [config, setConfig] = useState("{}");
  const [addingIntegration, setAddingIntegration] = useState(false);

  // webhook form state
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState("");
  const [addingWebhook, setAddingWebhook] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [iRes, wRes] = await Promise.all([
        fetch("/api/admin/integrations"),
        fetch("/api/admin/webhooks"),
      ]);
      if (!iRes.ok) throw new Error((await iRes.json()).error ?? "Failed to load integrations");
      const iData = await iRes.json();
      const wData = wRes.ok ? await wRes.json() : { webhooks: [] };
      setIntegrations(iData.integrations ?? []);
      setWebhooks(wData.webhooks ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addIntegration(e: React.FormEvent) {
    e.preventDefault();
    setAddingIntegration(true);
    setError(null);
    try {
      let parsedConfig: unknown;
      try {
        parsedConfig = JSON.parse(config);
      } catch {
        setError("Config must be valid JSON");
        return;
      }
      const res = await fetch("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name, config: parsedConfig }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to add integration");
      setKind(KINDS[0]);
      setName("");
      setConfig("{}");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add integration");
    } finally {
      setAddingIntegration(false);
    }
  }

  async function deleteIntegration(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/integrations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to delete integration");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete integration");
    }
  }

  async function addWebhook(e: React.FormEvent) {
    e.preventDefault();
    setAddingWebhook(true);
    setError(null);
    try {
      const eventList = events
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/admin/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, events: eventList }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to add webhook");
      setUrl("");
      setEvents("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add webhook");
    } finally {
      setAddingWebhook(false);
    }
  }

  async function deleteWebhook(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/webhooks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to delete webhook");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete webhook");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Integrations</h1>

      <p className="text-xs text-slate-400">
        Slack/Teams/webhook delivery runs in the worker (mock transport in this release); secrets
        are stored via secretRef, not inline.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <form onSubmit={addIntegration} className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Add integration</h2>
        <div className="flex flex-wrap items-end gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input
            required
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={addingIntegration || !name.trim()}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
          >
            {addingIntegration ? "Adding…" : "Add integration"}
          </button>
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-slate-500">Config (JSON)</label>
          <textarea
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            rows={5}
            className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
          />
        </div>
      </form>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : integrations.length === 0 ? (
        <p className="text-slate-500">No integrations yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {integrations.map((i) => (
                <tr key={i.id} className="align-top hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-600">{i.kind}</td>
                  <td className="px-3 py-2 font-medium">{i.name}</td>
                  <td className="px-3 py-2">
                    <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                      {i.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {new Date(i.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => deleteIntegration(i.id)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-red-600 hover:bg-slate-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={addWebhook} className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Add webhook</h2>
        <div className="flex flex-wrap items-end gap-2">
          <input
            required
            type="url"
            placeholder="https://example.com/hook"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="min-w-[18rem] flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <input
            placeholder="Events (ticket.created,ticket.updated)"
            value={events}
            onChange={(e) => setEvents(e.target.value)}
            className="min-w-[18rem] flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={addingWebhook || !url.trim()}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
          >
            {addingWebhook ? "Adding…" : "Add webhook"}
          </button>
        </div>
      </form>

      {!loading && webhooks.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">URL</th>
                <th className="px-3 py-2 font-medium">Events</th>
                <th className="px-3 py-2 font-medium">Last status</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {webhooks.map((w) => (
                <tr key={w.id} className="align-top hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{w.url}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {w.events.length ? w.events.join(", ") : "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{w.lastStatus ?? "—"}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => deleteWebhook(w.id)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-red-600 hover:bg-slate-50"
                    >
                      Delete
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
