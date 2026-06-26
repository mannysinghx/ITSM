"use client";

import { useState } from "react";
import Link from "next/link";

export default function NewArticlePage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          summary: summary.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create article");
      const data = await res.json();
      window.location.href = `/app/knowledge/${data.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create article");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-slate-500">
        <Link href="/app/knowledge" className="hover:underline">
          Knowledge Base
        </Link>{" "}
        / New Article
      </div>

      <h1 className="text-xl font-bold">New Article</h1>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <form onSubmit={create} className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
        <div>
          <label className="mb-1 block text-sm text-slate-600">Title</label>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Article title"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">Summary (optional)</label>
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Short summary"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">Body (markdown)</label>
          <textarea
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            placeholder="Write the article body in markdown…"
            className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
          />
        </div>
        <button
          type="submit"
          disabled={saving || !title.trim() || !body.trim()}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Creating…" : "Create article"}
        </button>
      </form>
    </div>
  );
}
