"use client";

import { useEffect, useState, useCallback } from "react";

interface TicketType {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
}
interface TicketStatus {
  id: string;
  key: string;
  name: string;
  category: string;
  order: number;
  isSystem: boolean;
}
interface MatrixCell {
  id: string;
  impact: string;
  urgency: string;
  priority: string;
}
interface Category {
  id: string;
  name: string;
  isSystem: boolean;
}
interface FieldDef {
  id: string;
  key: string;
  label: string;
  fieldType: string;
  required: boolean;
  order: number;
}
interface Config {
  types: TicketType[];
  statuses: TicketStatus[];
  matrix: MatrixCell[];
  categories: Category[];
  fieldDefs: FieldDef[];
}

type Tab = "Types" | "Statuses" | "Priorities" | "Categories" | "Custom Fields";
const TABS: Tab[] = ["Types", "Statuses", "Priorities", "Categories", "Custom Fields"];

const IMPACTS = ["low", "medium", "high", "critical"];
const URGENCIES = ["low", "medium", "high", "critical"];
const PRIORITIES = ["p1", "p2", "p3", "p4"];

export default function TicketConfigPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Types");

  // create buffers
  const [typeName, setTypeName] = useState("");
  const [statusName, setStatusName] = useState("");
  const [statusCategory, setStatusCategory] = useState("open");
  const [statusOrder, setStatusOrder] = useState("0");
  const [categoryName, setCategoryName] = useState("");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [fieldRequired, setFieldRequired] = useState(false);
  const [fieldOrder, setFieldOrder] = useState("0");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/config/tickets");
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load config");
      setConfig(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function mutate(body: {
    resource: string;
    op: "create" | "update" | "delete";
    id?: string;
    data?: Record<string, unknown>;
  }) {
    setError(null);
    try {
      const res = await fetch("/api/admin/config/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Action failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  }

  function matrixPriority(impact: string, urgency: string): string {
    return (
      config?.matrix.find((m) => m.impact === impact && m.urgency === urgency)
        ?.priority ?? ""
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-sm font-medium ${
              tab === t
                ? "border-b-2 border-brand text-slate-900"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading || !config ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <>
          {tab === "Types" && (
            <div className="space-y-3">
              <div className="flex items-end gap-2">
                <input
                  placeholder="Type name"
                  value={typeName}
                  onChange={(e) => setTypeName(e.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                />
                <button
                  onClick={() => {
                    if (!typeName) return;
                    mutate({
                      resource: "type",
                      op: "create",
                      data: { name: typeName },
                    });
                    setTypeName("");
                  }}
                  className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90"
                >
                  Add type
                </button>
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Key</th>
                      <th className="px-3 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {config.types.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium">{t.name}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-500">
                          {t.key}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {!t.isSystem && (
                            <button
                              onClick={() =>
                                mutate({ resource: "type", op: "delete", id: t.id })
                              }
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                            >
                              Delete
                            </button>
                          )}
                          {t.isSystem && (
                            <span className="text-xs text-slate-400">system</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "Statuses" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <input
                  placeholder="Status name"
                  value={statusName}
                  onChange={(e) => setStatusName(e.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                />
                <select
                  value={statusCategory}
                  onChange={(e) => setStatusCategory(e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                >
                  {["open", "pending", "resolved", "closed", "cancelled"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Order"
                  value={statusOrder}
                  onChange={(e) => setStatusOrder(e.target.value)}
                  className="w-24 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                />
                <button
                  onClick={() => {
                    if (!statusName) return;
                    mutate({
                      resource: "status",
                      op: "create",
                      data: {
                        name: statusName,
                        category: statusCategory,
                        order: Number(statusOrder) || 0,
                      },
                    });
                    setStatusName("");
                  }}
                  className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90"
                >
                  Add status
                </button>
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Category</th>
                      <th className="px-3 py-2 font-medium">Order</th>
                      <th className="px-3 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {config.statuses.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium">{s.name}</td>
                        <td className="px-3 py-2 text-slate-600">{s.category}</td>
                        <td className="px-3 py-2 text-slate-600">{s.order}</td>
                        <td className="px-3 py-2 text-right">
                          {!s.isSystem ? (
                            <button
                              onClick={() =>
                                mutate({ resource: "status", op: "delete", id: s.id })
                              }
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                            >
                              Delete
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">system</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "Priorities" && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Matrix changes apply to future tickets only; existing ticket
                priorities are not recomputed.
              </p>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Impact \ Urgency</th>
                      {URGENCIES.map((u) => (
                        <th key={u} className="px-3 py-2 font-medium capitalize">
                          {u}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {IMPACTS.map((impact) => (
                      <tr key={impact}>
                        <td className="px-3 py-2 font-medium capitalize">{impact}</td>
                        {URGENCIES.map((urgency) => (
                          <td key={urgency} className="px-3 py-2">
                            <select
                              value={matrixPriority(impact, urgency)}
                              onChange={(e) =>
                                mutate({
                                  resource: "matrix",
                                  op: "update",
                                  data: {
                                    impact,
                                    urgency,
                                    priority: e.target.value,
                                  },
                                })
                              }
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                            >
                              <option value="">—</option>
                              {PRIORITIES.map((p) => (
                                <option key={p} value={p}>
                                  {p.toUpperCase()}
                                </option>
                              ))}
                            </select>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "Categories" && (
            <div className="space-y-3">
              <div className="flex items-end gap-2">
                <input
                  placeholder="Category name"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                />
                <button
                  onClick={() => {
                    if (!categoryName) return;
                    mutate({
                      resource: "category",
                      op: "create",
                      data: { name: categoryName },
                    });
                    setCategoryName("");
                  }}
                  className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90"
                >
                  Add category
                </button>
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {config.categories.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium">{c.name}</td>
                        <td className="px-3 py-2 text-right">
                          {!c.isSystem ? (
                            <button
                              onClick={() =>
                                mutate({
                                  resource: "category",
                                  op: "delete",
                                  id: c.id,
                                })
                              }
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                            >
                              Delete
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">system</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "Custom Fields" && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Custom fields are stored but not filterable in this release.
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <input
                  placeholder="Field label"
                  value={fieldLabel}
                  onChange={(e) => setFieldLabel(e.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                />
                <select
                  value={fieldType}
                  onChange={(e) => setFieldType(e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                >
                  {["text", "textarea", "number", "date", "select", "checkbox"].map(
                    (ft) => (
                      <option key={ft} value={ft}>
                        {ft}
                      </option>
                    )
                  )}
                </select>
                <input
                  type="number"
                  placeholder="Order"
                  value={fieldOrder}
                  onChange={(e) => setFieldOrder(e.target.value)}
                  className="w-24 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                />
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={fieldRequired}
                    onChange={(e) => setFieldRequired(e.target.checked)}
                  />
                  Required
                </label>
                <button
                  onClick={() => {
                    if (!fieldLabel) return;
                    mutate({
                      resource: "field",
                      op: "create",
                      data: {
                        label: fieldLabel,
                        fieldType,
                        required: fieldRequired,
                        order: Number(fieldOrder) || 0,
                      },
                    });
                    setFieldLabel("");
                    setFieldRequired(false);
                  }}
                  className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90"
                >
                  Add field
                </button>
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Label</th>
                      <th className="px-3 py-2 font-medium">Key</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Required</th>
                      <th className="px-3 py-2 font-medium">Order</th>
                      <th className="px-3 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {config.fieldDefs.map((f) => (
                      <tr key={f.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium">{f.label}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-500">
                          {f.key}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{f.fieldType}</td>
                        <td className="px-3 py-2 text-slate-600">
                          {f.required ? "Yes" : "No"}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{f.order}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() =>
                              mutate({ resource: "field", op: "delete", id: f.id })
                            }
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
