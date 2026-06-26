"use client";

import { useCallback, useEffect, useState } from "react";

interface Form {
  id: string;
  name: string;
  schema: unknown;
  version: number;
}

const SAMPLE = JSON.stringify(
  { fields: [{ key: "field1", label: "Field 1", type: "text", required: true }] },
  null,
  2,
);

export default function AdminFormsPage() {
  const [forms, setForms] = useState<Form[]>([]);
  const [name, setName] = useState("");
  const [schema, setSchema] = useState(SAMPLE);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/forms");
    if (res.ok) setForms((await res.json()).forms ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  function parse(json: string): unknown | null {
    try { return JSON.parse(json); } catch { setError("Schema must be valid JSON"); return null; }
  }

  async function create() {
    setError(null);
    const parsed = parse(schema);
    if (parsed === null) return;
    const res = await fetch("/api/admin/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, schema: parsed }),
    });
    if (!res.ok) { setError((await res.json()).error ?? "Failed"); return; }
    setName(""); setSchema(SAMPLE); await load();
  }

  async function save(id: string) {
    setError(null);
    const parsed = parse(editing[id]);
    if (parsed === null) return;
    const res = await fetch(`/api/admin/forms/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schema: parsed }),
    });
    if (!res.ok) { setError((await res.json()).error ?? "Failed"); return; }
    await load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Forms</h1>
      <p className="text-sm text-slate-500">
        Form schemas are edited as JSON (visual builder deferred). Field types: text,
        textarea, dropdown (with <code>options</code>), multi_select, checkbox, date,
        datetime, number, currency, email, url, phone, user_picker, team_picker.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">New form</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Form name"
          className="mb-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <textarea
          value={schema}
          onChange={(e) => setSchema(e.target.value)}
          rows={8}
          className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
        />
        <button
          onClick={create}
          disabled={!name.trim()}
          className="mt-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
        >
          Create form
        </button>
      </div>

      <div className="space-y-3">
        {forms.map((f) => (
          <div key={f.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium">{f.name} <span className="text-xs text-slate-400">v{f.version}</span></span>
              <button onClick={() => save(f.id)} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                Save schema
              </button>
            </div>
            <textarea
              defaultValue={JSON.stringify(f.schema, null, 2)}
              onChange={(e) => setEditing((s) => ({ ...s, [f.id]: e.target.value }))}
              rows={8}
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
