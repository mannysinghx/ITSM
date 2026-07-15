"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Pill } from "@/components/ui/Pill";
import { APPROVAL_STATUS_COLORS, TICKET_CATEGORY_COLORS, colorFor } from "@/lib/ui/colors";

interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  approvalRequired: boolean;
}

export default function ServiceCatalogPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/catalog");
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load catalog");
      const data = await res.json();
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Service Catalog</h1>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-slate-500">No catalog items available.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/app/service-catalog/${item.id}`}
              className="flex flex-col rounded-lg border border-slate-200 bg-white p-4 hover:border-brand"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{item.name}</h2>
                {item.category && (
                  <Pill color={colorFor(TICKET_CATEGORY_COLORS, item.category)}>
                    {item.category}
                  </Pill>
                )}
              </div>
              {item.description && (
                <p className="mt-2 line-clamp-3 text-sm text-slate-600">{item.description}</p>
              )}
              {item.approvalRequired && (
                <div className="mt-3 w-fit">
                  <Pill color={colorFor(APPROVAL_STATUS_COLORS, "pending")} withDot>
                    Approval required
                  </Pill>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
