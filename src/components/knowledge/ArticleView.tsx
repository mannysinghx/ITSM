"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Pill } from "@/components/ui/Pill";
import { KNOWLEDGE_STATUS_COLORS, KNOWLEDGE_SOURCE_COLORS, colorFor } from "@/lib/ui/colors";

interface Version {
  version: number;
  aiGenerated: boolean;
  createdAt: string;
}

interface Article {
  id: string;
  title: string;
  slug: string;
  status: string;
  source: string;
  body: string;
  summary: string | null;
  versions: Version[];
  canEdit: boolean;
  canPublish: boolean;
}

export function ArticleView({ id }: { id: string }) {
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/knowledge/${id}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load article");
      const data: Article = await res.json();
      setArticle(data);
      setTitle(data.title);
      setBody(data.body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load article");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/knowledge/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      setEditing(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/knowledge/${id}/publish`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Publish failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  async function sendFeedback(helpful: boolean) {
    setError(null);
    try {
      const res = await fetch(`/api/knowledge/${id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          helpful,
          comment: feedbackComment.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Feedback failed");
      setFeedbackSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Feedback failed");
    }
  }

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (!article) return <p className="text-sm text-red-600">{error ?? "Not found."}</p>;

  return (
    <div className="space-y-6">
      <div className="text-sm text-slate-500">
        <Link href="/app/knowledge" className="hover:underline">
          Knowledge Base
        </Link>{" "}
        / {article.title}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">{article.title}</h1>
          <Pill color={colorFor(KNOWLEDGE_STATUS_COLORS, article.status)} withDot>
            {article.status}
          </Pill>
          <Pill color={colorFor(KNOWLEDGE_SOURCE_COLORS, article.source)}>{article.source}</Pill>
          <div className="ml-auto flex items-center gap-2">
            {article.canEdit && (
              <button
                onClick={() => setEditing((v) => !v)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                {editing ? "Cancel" : "Edit"}
              </button>
            )}
            {article.canPublish && article.status !== "published" && (
              <button
                onClick={publish}
                disabled={publishing}
                className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
              >
                {publishing ? "Publishing…" : "Publish"}
              </button>
            )}
          </div>
        </div>

        {editing ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">Body (markdown)</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={14}
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
              />
            </div>
            <button
              onClick={save}
              disabled={saving || !title.trim() || !body.trim()}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <pre className="whitespace-pre-wrap break-words font-sans text-sm text-slate-700">
              {article.body}
            </pre>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold">Version history</h2>
        {article.versions.length === 0 ? (
          <p className="text-sm text-slate-500">No versions.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {article.versions.map((v) => (
              <li key={v.version} className="flex items-center gap-2 py-2">
                <span className="font-medium">v{v.version}</span>
                {v.aiGenerated && (
                  <Pill color={colorFor(KNOWLEDGE_SOURCE_COLORS, "ai")}>AI-generated</Pill>
                )}
                <span className="ml-auto text-slate-500">
                  {new Date(v.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold">Was this helpful?</h2>
        {feedbackSent ? (
          <p className="text-sm text-green-600">Thanks for your feedback!</p>
        ) : (
          <div className="space-y-3">
            <textarea
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
              rows={2}
              placeholder="Comment (optional)"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => sendFeedback(true)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Yes
              </button>
              <button
                onClick={() => sendFeedback(false)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                No
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
