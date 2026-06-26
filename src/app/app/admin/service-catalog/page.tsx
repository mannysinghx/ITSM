"use client";

import { useEffect, useState, useCallback } from "react";

interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  teamId: string | null;
  defaultPriority: string;
  approvalRequired: boolean;
  visibility: string;
  status: string;
  formDefinitionId: string | null;
}

interface FormDef {
  id: string;
  name: string;
}

interface Team {
  id: string;
  name: string;
}

interface ChainStep {
  type: "team_manager";
}

const fieldCls = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm";

export default function AdminServiceCatalogPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [forms, setForms] = useState<FormDef[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // create form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [teamId, setTeamId] = useState("");
  const [formDefinitionId, setFormDefinitionId] = useState("");
  const [defaultPriority, setDefaultPriority] = useState("p3");
  const [visibility, setVisibility] = useState("internal");
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [approvalChain, setApprovalChain] = useState<ChainStep[]>([]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cRes, fRes, tRes] = await Promise.all([
        fetch("/api/admin/catalog"),
        fetch("/api/admin/forms"),
        fetch("/api/admin/teams"),
      ]);
      if (!cRes.ok) throw new Error((await cRes.json()).error ?? "Failed to load catalog");
      const cData = await cRes.json();
      const fData = fRes.ok ? await fRes.json() : { forms: [] };
      const tData = tRes.ok ? await tRes.json() : { teams: [] };
      setItems(cData.items ?? []);
      setForms(fData.forms ?? []);
      setTeams(tData.teams ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setName("");
    setDescription("");
    setCategory("");
    setTeamId("");
    setFormDefinitionId("");
    setDefaultPriority("p3");
    setVisibility("internal");
    setApprovalRequired(false);
    setApprovalChain([]);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || undefined,
          category: category || undefined,
          teamId: teamId || null,
          formDefinitionId: formDefinitionId || null,
          defaultPriority,
          visibility,
          approvalRequired,
          approvalChain: approvalRequired ? approvalChain : [],
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Create failed");
      resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function toggleStatus(item: CatalogItem) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/catalog/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: item.status === "active" ? "inactive" : "active" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Action failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Service Catalog (Admin)</h1>
        <p className="mt-1 text-sm text-slate-400">
          Form schemas are edited as JSON under Admin → Forms; visual builder is deferred.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <form onSubmit={create} className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Create catalog item</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-sm font-medium">Name</label>
            <input
              required
              className={fieldCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium">Description</label>
            <textarea
              rows={3}
              className={fieldCls}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Category</label>
            <input
              className={fieldCls}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Team</label>
            <select className={fieldCls} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">Any</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Form</label>
            <select
              className={fieldCls}
              value={formDefinitionId}
              onChange={(e) => setFormDefinitionId(e.target.value)}
            >
              <option value="">None</option>
              {forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Default priority</label>
            <select
              className={fieldCls}
              value={defaultPriority}
              onChange={(e) => setDefaultPriority(e.target.value)}
            >
              {["p1", "p2", "p3", "p4"].map((p) => (
                <option key={p} value={p}>
                  {p.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Visibility</label>
            <select
              className={fieldCls}
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
            >
              {["public", "internal", "team"].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <input
              id="approvalRequired"
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={approvalRequired}
              onChange={(e) => setApprovalRequired(e.target.checked)}
            />
            <label htmlFor="approvalRequired" className="text-sm font-medium">
              Approval required
            </label>
          </div>

          {approvalRequired && (
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">Approval chain</label>
              <div className="mt-1 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                {approvalChain.length === 0 ? (
                  <p className="text-xs text-slate-500">No steps yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {approvalChain.map((step, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700"
                      >
                        {i + 1}. {step.type}
                        <button
                          type="button"
                          onClick={() =>
                            setApprovalChain((c) => c.filter((_, idx) => idx !== i))
                          }
                          className="text-slate-500 hover:text-red-600"
                          aria-label="Remove step"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setApprovalChain((c) => [...c, { type: "team_manager" }])}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-white"
                >
                  Add manager approval step
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4">
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create catalog item"}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-slate-500">No catalog items yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Visibility</th>
                <th className="px-3 py-2 font-medium">Priority</th>
                <th className="px-3 py-2 font-medium">Approval</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium">{item.name}</td>
                  <td className="px-3 py-2 text-slate-600">{item.category ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{item.visibility}</td>
                  <td className="px-3 py-2 text-slate-600">{item.defaultPriority.toUpperCase()}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {item.approvalRequired ? "Yes" : "No"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                      {item.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => toggleStatus(item)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                    >
                      {item.status === "active" ? "Disable" : "Enable"}
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
