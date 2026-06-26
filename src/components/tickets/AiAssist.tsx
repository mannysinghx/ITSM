"use client";

import { useState } from "react";

interface Result {
  status: string;
  outputId?: string;
  content?: unknown;
  aiSuggested?: boolean;
  isMock?: boolean;
  articleId?: string;
}

function renderContent(useCase: string, content: unknown): string {
  const c = content as Record<string, string>;
  switch (useCase) {
    case "classify": return `Suggested type: ${c.type}`;
    case "priority": return `Suggested priority: ${c.priority?.toUpperCase()}`;
    case "team": return `Suggested team: ${c.team}`;
    case "summarize": return c.summary;
    case "draft": return c.draft;
    default: return JSON.stringify(content);
  }
}

export function AiAssist({ ticketId }: { ticketId: string }) {
  const [useCase, setUseCase] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function run(endpoint: string, uc: string) {
    setBusy(true); setNote(null); setResult(null); setUseCase(uc);
    const res = await fetch(`/api/ai/${endpoint}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setNote(data.error ?? "AI request failed"); return; }
    if (data.status === "disabled") { setNote("AI is disabled for this module."); return; }
    if (data.status === "budget_blocked") { setNote("AI token budget exhausted for this period."); return; }
    setResult(data);
  }

  async function decide(accepted: boolean) {
    if (!result?.outputId) return;
    await fetch(`/api/ai/outputs/${result.outputId}/${accepted ? "accept" : "reject"}`, { method: "POST" });
    setNote(accepted ? "Suggestion accepted." : "Suggestion dismissed.");
    setResult(null);
  }

  async function saveKb() {
    setBusy(true); setNote(null);
    const res = await fetch(`/api/ai/generate-article`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId, save: true }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.articleId) setNote(`Knowledge draft created.`);
    else setNote(data.error ?? "Could not generate draft");
  }

  const btn = "rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50";

  return (
    <section className="rounded-lg border border-violet-200 bg-violet-50 p-4">
      <h2 className="mb-2 text-sm font-semibold text-violet-700">AI Assist</h2>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} className={btn} onClick={() => run("summarize", "summarize")}>Summarize</button>
        <button disabled={busy} className={btn} onClick={() => run("suggest-priority", "priority")}>Suggest priority</button>
        <button disabled={busy} className={btn} onClick={() => run("suggest-team", "team")}>Suggest team</button>
        <button disabled={busy} className={btn} onClick={() => run("draft-response", "draft")}>Draft reply</button>
        <button disabled={busy} className={btn} onClick={saveKb}>Save as KB draft</button>
      </div>

      {note && <p className="mt-2 text-xs text-violet-700">{note}</p>}

      {result && useCase && (
        <div className="mt-3 rounded-md border border-violet-200 bg-white p-3 text-sm">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-700">
              AI suggested{result.isMock ? " · mock" : ""}
            </span>
          </div>
          <p className="whitespace-pre-wrap">{renderContent(useCase, result.content)}</p>
          <div className="mt-2 flex gap-2">
            <button className={btn} onClick={() => decide(true)}>Accept</button>
            <button className={btn} onClick={() => decide(false)}>Dismiss</button>
          </div>
        </div>
      )}
    </section>
  );
}
