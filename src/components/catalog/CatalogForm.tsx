"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface FormField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
}

interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  approvalRequired: boolean;
  formSchema: { fields: FormField[] };
}

const field = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm";

export function CatalogForm({ itemId }: { itemId: string }) {
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/catalog/${itemId}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load item");
      setItem(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    load();
  }, [load]);

  function setValue(key: string, value: unknown) {
    setValues((v) => {
      const next = { ...v };
      const empty =
        value === undefined ||
        value === "" ||
        value === null ||
        (Array.isArray(value) && value.length === 0);
      if (empty) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setIssues([]);
    try {
      const res = await fetch(`/api/catalog/${itemId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Submission failed");
        const flat = data.issues?.fieldErrors as Record<string, string[]> | undefined;
        if (flat) {
          setIssues(
            Object.entries(flat).flatMap(([k, msgs]) => msgs.map((m) => `${k}: ${m}`)),
          );
        }
        return;
      }
      window.location.href = `/app/tickets/${data.ticketId}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setBusy(false);
    }
  }

  function renderField(f: FormField) {
    const v = values[f.key];
    const common = { required: f.required, className: field };

    switch (f.type) {
      case "textarea":
      case "rich_text":
        return (
          <textarea
            {...common}
            rows={4}
            value={(v as string) ?? ""}
            onChange={(e) => setValue(f.key, e.target.value)}
          />
        );
      case "email":
        return (
          <input
            {...common}
            type="email"
            value={(v as string) ?? ""}
            onChange={(e) => setValue(f.key, e.target.value)}
          />
        );
      case "url":
        return (
          <input
            {...common}
            type="url"
            value={(v as string) ?? ""}
            onChange={(e) => setValue(f.key, e.target.value)}
          />
        );
      case "number":
      case "currency":
        return (
          <input
            {...common}
            type="number"
            value={v === undefined ? "" : (v as number)}
            onChange={(e) =>
              setValue(f.key, e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        );
      case "date":
        return (
          <input
            {...common}
            type="date"
            value={(v as string) ?? ""}
            onChange={(e) => setValue(f.key, e.target.value)}
          />
        );
      case "datetime":
        return (
          <input
            {...common}
            type="datetime-local"
            value={(v as string) ?? ""}
            onChange={(e) => setValue(f.key, e.target.value)}
          />
        );
      case "checkbox":
        return (
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-slate-300"
            checked={Boolean(v)}
            onChange={(e) => setValue(f.key, e.target.checked)}
          />
        );
      case "dropdown":
        return (
          <select
            {...common}
            value={(v as string) ?? ""}
            onChange={(e) => setValue(f.key, e.target.value)}
          >
            <option value="">Select…</option>
            {(f.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        );
      case "multi_select":
        return (
          <select
            multiple
            required={f.required}
            className={field}
            value={(v as string[]) ?? []}
            onChange={(e) =>
              setValue(
                f.key,
                Array.from(e.target.selectedOptions).map((o) => o.value),
              )
            }
          >
            {(f.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        );
      case "user_picker":
      case "team_picker":
      case "asset_picker":
        return (
          <input
            {...common}
            type="text"
            placeholder="id (uuid)"
            value={(v as string) ?? ""}
            onChange={(e) => setValue(f.key, e.target.value)}
          />
        );
      case "attachment":
        return (
          <input
            {...common}
            type="text"
            placeholder="attachment reference"
            value={(v as string) ?? ""}
            onChange={(e) => setValue(f.key, e.target.value)}
          />
        );
      default:
        // text, phone, and any unknown type
        return (
          <input
            {...common}
            type="text"
            value={(v as string) ?? ""}
            onChange={(e) => setValue(f.key, e.target.value)}
          />
        );
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/app/service-catalog" className="text-sm text-slate-500 hover:underline">
        ← Service Catalog
      </Link>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {issues.length > 0 && (
        <ul className="list-inside list-disc text-sm text-red-600">
          {issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : !item ? (
        <p className="text-slate-500">Item not found.</p>
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-bold">{item.name}</h1>
            {item.description && <p className="mt-1 text-sm text-slate-600">{item.description}</p>}
            {item.approvalRequired && (
              <span className="mt-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                Approval required
              </span>
            )}
          </div>

          <form onSubmit={submit} className="max-w-2xl space-y-4">
            {item.formSchema.fields.map((f) =>
              f.type === "checkbox" ? (
                <div key={f.key} className="flex items-center gap-2">
                  {renderField(f)}
                  <label className="text-sm font-medium">
                    {f.label}
                    {f.required && <span className="text-red-600"> *</span>}
                  </label>
                </div>
              ) : (
                <div key={f.key}>
                  <label className="text-sm font-medium">
                    {f.label}
                    {f.required && <span className="text-red-600"> *</span>}
                  </label>
                  {renderField(f)}
                </div>
              ),
            )}
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-brand px-4 py-2 font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Submitting…" : "Submit request"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
