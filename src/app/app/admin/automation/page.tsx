"use client";

import { useEffect, useState, useCallback } from "react";
import { Pill } from "@/components/ui/Pill";
import { ACTIVE_STATE_COLORS, RUN_STATUS_COLORS, STEP_STATUS_COLORS, colorFor } from "@/lib/ui/colors";

interface Rule {
  id: string;
  name: string;
  event: string;
  conditions: unknown;
  actions: unknown;
  enabled: boolean;
  priority: number;
}

interface Step {
  stepIndex: number;
  actionType: string;
  status: string;
  error: string | null;
}

interface Run {
  id: string;
  triggerEvent: string;
  entityType: string;
  entityId: string;
  status: string;
  depth: number;
  startedAt: string;
  steps: Step[];
}

const EVENTS = [
  "ticket.created",
  "ticket.updated",
  "ticket.status_changed",
  "ticket.assigned",
  "comment.created",
];

const DEFAULT_ACTIONS = JSON.stringify([{ type: "set_priority", value: "p1" }]);

export default function AdminAutomationPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // create form state
  const [name, setName] = useState("");
  const [event, setEvent] = useState(EVENTS[0]);
  const [priority, setPriority] = useState("0");
  const [conditions, setConditions] = useState("[]");
  const [actions, setActions] = useState(DEFAULT_ACTIONS);
  const [creating, setCreating] = useState(false);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rRes, runRes] = await Promise.all([
        fetch("/api/admin/automation-rules"),
        fetch("/api/admin/runs"),
      ]);
      if (!rRes.ok) throw new Error((await rRes.json()).error ?? "Failed to load rules");
      const rData = await rRes.json();
      const runData = runRes.ok ? await runRes.json() : { runs: [] };
      setRules(rData.rules ?? []);
      setRuns(runData.runs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function parse(json: string, label: string): unknown | null {
    try {
      return JSON.parse(json);
    } catch {
      setError(`${label} must be valid JSON`);
      return null;
    }
  }

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const parsedConditions = parse(conditions, "Conditions");
      if (parsedConditions === null) return;
      const parsedActions = parse(actions, "Actions");
      if (parsedActions === null) return;
      const res = await fetch("/api/admin/automation-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          event,
          priority: Number(priority),
          conditions: parsedConditions,
          actions: parsedActions,
        }),
      });
      if (res.status !== 201) throw new Error((await res.json()).error ?? "Failed to create rule");
      setName("");
      setEvent(EVENTS[0]);
      setPriority("0");
      setConditions("[]");
      setActions(DEFAULT_ACTIONS);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create rule");
    } finally {
      setCreating(false);
    }
  }

  async function toggleRule(rule: Rule) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/automation-rules/${rule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to update rule");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update rule");
    }
  }

  async function deleteRule(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/automation-rules/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to delete rule");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete rule");
    }
  }

  function actionCount(rule: Rule): number {
    return Array.isArray(rule.actions) ? rule.actions.length : 0;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Automation</h1>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <form onSubmit={createRule} className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Create rule</h2>
        <div className="flex flex-wrap items-end gap-2">
          <input
            required
            placeholder="Rule name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <select
            value={event}
            onChange={(e) => setEvent(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {EVENTS.map((ev) => (
              <option key={ev} value={ev}>
                {ev}
              </option>
            ))}
          </select>
          <input
            type="number"
            step={1}
            placeholder="Priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-28 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Conditions (JSON)</label>
            <textarea
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              rows={6}
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Actions (JSON)</label>
            <textarea
              value={actions}
              onChange={(e) => setActions(e.target.value)}
              rows={6}
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="mt-3 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create rule"}
        </button>
      </form>

      <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-500">
        <p className="mb-1 font-semibold text-slate-600">Available actions</p>
        <p className="mb-2">
          Synchronous: <code>set_priority {`{value}`}</code>, <code>assign_team {`{teamId}`}</code>,{" "}
          <code>assign_user {`{userId}`}</code>, <code>add_tag {`{value}`}</code>,{" "}
          <code>send_notification {`{userIds,title,body}`}</code>, <code>create_task {`{title}`}</code>,{" "}
          <code>add_internal_note {`{body}`}</code>. Deferred to worker:{" "}
          <code>call_webhook {`{url}`}</code>, <code>send_slack</code>, <code>send_teams</code>,{" "}
          <code>escalate</code>.
        </p>
        <p className="font-semibold text-slate-600">Conditions</p>
        <p>
          <code>{`{field, operator, value}`}</code> — operators: equals, not_equals, contains, in, gt,
          lt, is_set, is_empty.
        </p>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : rules.length === 0 ? (
        <p className="text-slate-500">No automation rules yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="px-3 py-2 font-medium">Enabled</th>
                <th className="px-3 py-2 font-medium">Priority</th>
                <th className="px-3 py-2 font-medium">Actions</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rules.map((r) => (
                <tr key={r.id} className="align-top hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 text-slate-600">{r.event}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => toggleRule(r)}>
                      <Pill
                        color={colorFor(ACTIVE_STATE_COLORS, r.enabled ? "enabled" : "disabled")}
                        withDot
                      >
                        {r.enabled ? "Enabled" : "Disabled"}
                      </Pill>
                    </button>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{r.priority}</td>
                  <td className="px-3 py-2 text-slate-600">{actionCount(r)}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => deleteRule(r.id)}
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

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Run history</h2>
        {runs.length === 0 ? (
          <p className="text-slate-500">No runs yet.</p>
        ) : (
          runs.map((run) => {
            const open = expanded[run.id];
            return (
              <div key={run.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <button
                  onClick={() => setExpanded((s) => ({ ...s, [run.id]: !s[run.id] }))}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <Pill color={colorFor(RUN_STATUS_COLORS, run.status)} withDot>
                    {run.status}
                  </Pill>
                  <span className="font-medium">{run.triggerEvent}</span>
                  <span className="text-xs text-slate-400">
                    {run.entityType} · depth {run.depth} ·{" "}
                    {new Date(run.startedAt).toLocaleString()}
                  </span>
                  <span className="ml-auto text-xs text-slate-400">
                    {open ? "Hide steps" : `${run.steps.length} step${run.steps.length === 1 ? "" : "s"}`}
                  </span>
                </button>
                {open && (
                  <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                    {run.steps.length === 0 ? (
                      <li className="text-xs text-slate-400">No steps.</li>
                    ) : (
                      run.steps.map((step) => (
                        <li key={step.stepIndex} className="flex items-center gap-2 text-xs">
                          <Pill color={colorFor(STEP_STATUS_COLORS, step.status)} withDot>
                            {step.status}
                          </Pill>
                          <span className="text-slate-600">{step.actionType}</span>
                          {step.error && <span className="text-red-600">{step.error}</span>}
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
