"use client";

import { useEffect, useState, useCallback } from "react";
import { PriorityBadge } from "@/components/tickets/badges";

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  teamId: string;
  ticketId: string | null;
  assignee: { id: string; name: string } | null;
  team: { name: string };
}

interface Team {
  id: string;
  name: string;
  isDefault?: boolean;
}

const COLUMNS: { key: string; name: string }[] = [
  { key: "todo", name: "To Do" },
  { key: "in_progress", name: "In Progress" },
  { key: "blocked", name: "Blocked" },
  { key: "done", name: "Done" },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // new task form state
  const [title, setTitle] = useState("");
  const [teamId, setTeamId] = useState("");
  const [priority, setPriority] = useState("p3");
  const [dueAt, setDueAt] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks");
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load tasks");
      const data = await res.json();
      setTasks(data.tasks ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/tickets/meta")
      .then((r) => r.json())
      .then((data) => {
        const ts: Team[] = data.teams ?? [];
        setTeams(ts);
        const def = ts.find((t) => t.isDefault) ?? ts[0];
        if (def) setTeamId(def.id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { title, teamId, priority };
      if (dueAt) body.dueAt = new Date(dueAt).toISOString();
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create task");
      setTitle("");
      setPriority("p3");
      setDueAt("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create task");
    } finally {
      setCreating(false);
    }
  }

  async function changeStatus(taskId: string, status: string) {
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to update task");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update task");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Tasks</h1>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <form onSubmit={createTask} className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">New task</h2>
        <div className="flex flex-wrap items-end gap-2">
          <input
            required
            placeholder="Task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="min-w-[16rem] flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {["p1", "p2", "p3", "p4"].map((p) => (
              <option key={p} value={p}>
                {p.toUpperCase()}
              </option>
            ))}
          </select>
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating…" : "New task"}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.key);
            return (
              <div key={col.key} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-xs font-semibold text-slate-500">{col.name}</span>
                  <span className="text-xs text-slate-400">{colTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {colTasks.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-slate-400">No tasks.</p>
                  ) : (
                    colTasks.map((t) => (
                      <div
                        key={t.id}
                        className="rounded-md border border-slate-200 bg-white p-2 text-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium">{t.title}</span>
                          <PriorityBadge priority={t.priority} />
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {t.assignee?.name ?? "Unassigned"}
                        </div>
                        {t.dueAt && (
                          <div className="mt-0.5 text-xs text-slate-400">
                            Due {new Date(t.dueAt).toLocaleString()}
                          </div>
                        )}
                        <select
                          value={t.status}
                          onChange={(e) => changeStatus(t.id, e.target.value)}
                          className="mt-2 w-full rounded-md border border-slate-300 px-1.5 py-1 text-xs"
                        >
                          {STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
