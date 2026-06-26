"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PriorityBadge, StatusBadge } from "@/components/tickets/badges";
import { SlaPanel } from "@/components/tickets/SlaPanel";
import { LinkedTasks } from "@/components/tickets/LinkedTasks";

interface Comment {
  id: string;
  body: string;
  isInternal: boolean;
  authorId: string;
  createdAt: string;
}
interface History {
  id: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}
interface Ticket {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  priority: string;
  impact: string;
  urgency: string;
  tags: string[];
  createdAt: string;
  status: { key: string; name: string; category: string };
  type: { name: string };
  category: { name: string } | null;
  team: { id: string; name: string };
  requester: { id: string; name: string; email: string };
  assignee: { id: string; name: string; email: string } | null;
  comments: Comment[];
  history: History[];
  attachments: { id: string; filename: string; byteSize: number }[];
}
interface Payload {
  ticket: Ticket;
  canWrite: boolean;
  canViewInternal: boolean;
}

export function TicketDetail({ id }: { id: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tickets/${id}`);
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed to load");
      return;
    }
    setData(await res.json());
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch("/api/me").then((r) => r.json()).then((m) => setMe(m.userId ?? null)); }, []);

  async function post(path: string, body?: unknown) {
    setBusy(true);
    const res = await fetch(`/api/tickets/${id}${path}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error ?? "Action failed"); return false; }
    await load();
    return true;
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    setBusy(true);
    const res = await fetch(`/api/tickets/${id}/attachments`, { method: "POST", body: fd });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error ?? "Upload failed"); return; }
    await load();
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <p className="text-slate-500">Loading…</p>;
  const t = data.ticket;
  const publicComments = t.comments.filter((c) => !c.isInternal);
  const internalComments = t.comments.filter((c) => c.isInternal);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/app/tickets" className="hover:underline">Tickets</Link>
        <span>/</span>
        <span className="font-mono">{t.ticketNumber}</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <h1 className="text-xl font-bold">{t.title}</h1>
        <StatusBadge name={t.status.name} category={t.status.category} />
        <PriorityBadge priority={t.priority} />
        <span className="text-sm text-slate-500">{t.team.name}</span>
        <span className="text-sm text-slate-500">· {t.assignee ? `Assigned to ${t.assignee.name}` : "Unassigned"}</span>
        {data.canWrite && (
          <div className="ml-auto flex flex-wrap gap-2">
            {me && t.assignee?.id !== me && (
              <button onClick={() => post("/assign", { assigneeId: me })} disabled={busy}
                className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50">Assign to me</button>
            )}
            {t.assignee && (
              <button onClick={() => post("/assign", { assigneeId: null })} disabled={busy}
                className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50">Unassign</button>
            )}
            {t.status.category !== "resolved" && t.status.category !== "closed" && (
              <button onClick={() => post("/resolve")} disabled={busy}
                className="rounded border border-green-300 bg-green-50 px-2 py-1 text-sm text-green-800 hover:bg-green-100">Resolve</button>
            )}
            {t.status.category !== "closed" && (
              <button onClick={() => post("/close")} disabled={busy}
                className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50">Close</button>
            )}
            {(t.status.category === "resolved" || t.status.category === "closed") && (
              <button onClick={() => post("/reopen")} disabled={busy}
                className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-sm text-blue-800 hover:bg-blue-100">Reopen</button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Main */}
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-500">Description</h2>
            <p className="whitespace-pre-wrap text-sm">{t.description}</p>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-500">Conversation</h2>
            <div className="space-y-3">
              {publicComments.length === 0 && <p className="text-sm text-slate-400">No public comments yet.</p>}
              {publicComments.map((c) => (
                <div key={c.id} className="rounded-md bg-slate-50 p-3 text-sm">
                  <div className="mb-1 text-xs text-slate-400">{new Date(c.createdAt).toLocaleString()}</div>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <textarea rows={2} placeholder="Add a public reply…" value={reply}
                onChange={(e) => setReply(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <button
                disabled={busy || !reply.trim()}
                onClick={async () => { if (await post("/comments", { body: reply })) setReply(""); }}
                className="mt-2 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50">
                Reply
              </button>
            </div>
          </section>

          {/* Internal notes — only rendered when permitted (INV-4) */}
          {data.canViewInternal && (
            <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h2 className="mb-2 text-sm font-semibold text-amber-700">Internal notes (hidden from requester)</h2>
              <div className="space-y-3">
                {internalComments.length === 0 && <p className="text-sm text-amber-600/70">No internal notes.</p>}
                {internalComments.map((c) => (
                  <div key={c.id} className="rounded-md bg-white/70 p-3 text-sm">
                    <div className="mb-1 text-xs text-slate-400">{new Date(c.createdAt).toLocaleString()}</div>
                    <p className="whitespace-pre-wrap">{c.body}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <textarea rows={2} placeholder="Add an internal note…" value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-md border border-amber-300 px-3 py-2 text-sm" />
                <button
                  disabled={busy || !note.trim()}
                  onClick={async () => { if (await post("/internal-notes", { body: note })) setNote(""); }}
                  className="mt-2 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                  Add note
                </button>
              </div>
            </section>
          )}

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-500">Attachments</h2>
            <ul className="mb-2 space-y-1 text-sm">
              {t.attachments.map((a) => (
                <li key={a.id} className="text-slate-600">📎 {a.filename} ({Math.ceil(a.byteSize / 1024)} KB)</li>
              ))}
              {t.attachments.length === 0 && <li className="text-slate-400">None.</li>}
            </ul>
            <input type="file" onChange={uploadFile} disabled={busy} className="text-sm" />
          </section>

          <LinkedTasks ticketId={t.id} teamId={t.team.id} />

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-500">History</h2>
            <ol className="space-y-2 text-sm">
              {t.history.map((h) => (
                <li key={h.id} className="flex gap-2 text-slate-600">
                  <span className="text-xs text-slate-400">{new Date(h.createdAt).toLocaleString()}</span>
                  <span>
                    <strong>{h.action.replace(/_/g, " ")}</strong>
                    {h.field ? ` — ${h.field}` : ""}
                    {h.oldValue || h.newValue ? `: ${h.oldValue ?? "—"} → ${h.newValue ?? "—"}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Right panel */}
        <aside className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <Detail label="Requester" value={t.requester.name} />
            <Detail label="Assignee" value={t.assignee?.name ?? "Unassigned"} />
            <Detail label="Type" value={t.type.name} />
            <Detail label="Category" value={t.category?.name ?? "—"} />
            <Detail label="Impact" value={t.impact} />
            <Detail label="Urgency" value={t.urgency} />
            <Detail label="Tags" value={t.tags.length ? t.tags.join(", ") : "—"} />
            <Detail label="Created" value={new Date(t.createdAt).toLocaleString()} />
          </div>
          <SlaPanel ticketId={t.id} />
          <div className="rounded-lg border border-dashed border-slate-300 p-4 text-xs text-slate-400">
            Linked assets &amp; knowledge suggestions (Phases 5–6) appear here.
          </div>
        </aside>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 py-1.5 last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
