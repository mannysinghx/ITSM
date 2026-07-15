"use client";

import { useCallback, useEffect, useState } from "react";
import { Pill } from "@/components/ui/Pill";
import { TASK_STATUS_COLORS, colorFor } from "@/lib/ui/colors";

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee: { name: string } | null;
}

export function LinkedTasks({ ticketId, teamId }: { ticketId: string; teamId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tickets/${ticketId}/tasks`);
    if (res.ok) setTasks((await res.json()).tasks ?? []);
  }, [ticketId]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!title.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, ticketId }),
    });
    setBusy(false);
    if (res.ok) { setTitle(""); await load(); }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-500">Linked tasks</h2>
      <ul className="mb-3 space-y-1 text-sm">
        {tasks.length === 0 && <li className="text-slate-400">No tasks yet.</li>}
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center justify-between">
            <span>{t.title}</span>
            <Pill color={colorFor(TASK_STATUS_COLORS, t.status)} withDot>
              {t.status.replace(/_/g, " ")}
            </Pill>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New task title…"
          className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button
          onClick={add}
          disabled={busy || !title.trim()}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-400">teamId {teamId.slice(0, 8)}…</p>
    </section>
  );
}
