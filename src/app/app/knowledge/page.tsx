"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Pill } from "@/components/ui/Pill";
import { KNOWLEDGE_STATUS_COLORS, KNOWLEDGE_SOURCE_COLORS, colorFor } from "@/lib/ui/colors";

interface Article {
  id: string;
  title: string;
  slug: string;
  status: string;
  source: string;
  updatedAt: string;
}

export default function KnowledgePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/knowledge");
    const data = await res.json();
    setArticles(data.articles ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Knowledge Base</h1>
        <Link
          href="/app/knowledge/new"
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90"
        >
          New article
        </Link>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : articles.length === 0 ? (
        <p className="text-slate-500">No articles yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {articles.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Link
                      href={`/app/knowledge/${a.id}`}
                      className="font-medium hover:underline"
                    >
                      {a.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Pill color={colorFor(KNOWLEDGE_STATUS_COLORS, a.status)} withDot>
                      {a.status}
                    </Pill>
                  </td>
                  <td className="px-3 py-2">
                    <Pill color={colorFor(KNOWLEDGE_SOURCE_COLORS, a.source)}>{a.source}</Pill>
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {new Date(a.updatedAt).toLocaleDateString()}
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
