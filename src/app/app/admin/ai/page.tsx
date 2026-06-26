"use client";

import { useCallback, useEffect, useState } from "react";

interface AiSettings {
  enabled: boolean;
  provider: string;
  redaction: { enabled: boolean };
  budget: { tokenLimit: number; windowDays: number };
  perModule: {
    classify: boolean;
    priority: boolean;
    team: boolean;
    summarize: boolean;
    draft: boolean;
    knowledge: boolean;
  };
  externalAutoResponseAllowed: boolean;
}

interface Usage {
  promptTokens: number;
  completionTokens: number;
  requestCount: number;
  costUsd: number;
  limit: number;
  windowDays: number;
}

const MODULES: { key: keyof AiSettings["perModule"]; label: string }[] = [
  { key: "classify", label: "Classify" },
  { key: "priority", label: "Priority" },
  { key: "team", label: "Team routing" },
  { key: "summarize", label: "Summarize" },
  { key: "draft", label: "Draft response" },
  { key: "knowledge", label: "Knowledge" },
];

export default function AdminAiPage() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sRes, uRes] = await Promise.all([
        fetch("/api/admin/ai-settings"),
        fetch("/api/ai/usage"),
      ]);
      if (!sRes.ok) throw new Error((await sRes.json()).error ?? "Failed to load settings");
      const sData = await sRes.json();
      setSettings(sData.settings);
      if (uRes.ok) setUsage(await uRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/admin/ai-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: settings.enabled,
          provider: settings.provider,
          redaction: { enabled: settings.redaction.enabled },
          budget: {
            tokenLimit: Number(settings.budget.tokenLimit),
            windowDays: Number(settings.budget.windowDays),
          },
          perModule: { ...settings.perModule },
          externalAutoResponseAllowed: settings.externalAutoResponseAllowed,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      setSaved(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (!settings) return <p className="text-sm text-red-600">{error ?? "No settings."}</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">AI Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          With no provider key configured, all AI features return deterministic mock
          output. Every call is logged and budgeted.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">Saved.</p>}

      {usage && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold">Usage</h2>
          <p className="text-sm text-slate-600">
            Used {usage.promptTokens + usage.completionTokens} / {usage.limit} tokens
            this window ({usage.requestCount} requests).
          </p>
        </div>
      )}

      <form onSubmit={save} className="space-y-6">
        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <h2 className="text-sm font-semibold">General</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
            />
            AI enabled
          </label>
          <div>
            <label className="mb-1 block text-sm text-slate-600">Provider</label>
            <input
              value={settings.provider}
              onChange={(e) => setSettings({ ...settings, provider: e.target.value })}
              placeholder="mock"
              className="w-full max-w-xs rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <p className="mt-1 text-xs text-slate-400">
              Only the mock provider is wired in this release.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.redaction.enabled}
              onChange={(e) =>
                setSettings({ ...settings, redaction: { enabled: e.target.checked } })
              }
            />
            Redact PII before sending to provider (recommended)
          </label>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <h2 className="text-sm font-semibold">Budget</h2>
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="mb-1 block text-sm text-slate-600">Token limit</label>
              <input
                type="number"
                value={settings.budget.tokenLimit}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    budget: { ...settings.budget, tokenLimit: Number(e.target.value) },
                  })
                }
                className="w-40 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">Window (days)</label>
              <input
                type="number"
                value={settings.budget.windowDays}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    budget: { ...settings.budget, windowDays: Number(e.target.value) },
                  })
                }
                className="w-40 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <h2 className="text-sm font-semibold">Per-module</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {MODULES.map((m) => (
              <label key={m.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.perModule[m.key]}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      perModule: { ...settings.perModule, [m.key]: e.target.checked },
                    })
                  }
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
          <h2 className="text-sm font-semibold">External responses</h2>
          <label className="flex items-center gap-2 text-sm text-red-600">
            <input
              type="checkbox"
              checked={settings.externalAutoResponseAllowed}
              onChange={(e) =>
                setSettings({ ...settings, externalAutoResponseAllowed: e.target.checked })
              }
            />
            Allow AI to send responses externally
          </label>
          <p className="text-xs text-red-500">
            Off by default. Enabling lets AI send responses to requesters without human
            review.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}
