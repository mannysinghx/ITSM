"use client";

import { useCallback, useEffect, useState } from "react";

interface Note {
  id: string;
  title: string;
  body: string;
  type: string;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const [items, setItems] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/notifications");
    if (res.ok) {
      const d = await res.json();
      setItems(d.items ?? []);
      setUnread(d.unread ?? 0);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  async function markAll() {
    await fetch("/api/notifications/read-all", { method: "POST" });
    await load();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md border border-slate-300 px-2.5 py-1.5 text-sm hover:bg-slate-100"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-brand hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {items.length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-slate-400">No notifications.</li>
            )}
            {items.map((n) => (
              <li key={n.id} className={`px-3 py-2.5 text-sm ${n.readAt ? "" : "bg-blue-50/50"}`}>
                <div className="font-medium">{n.title}</div>
                <div className="text-xs text-slate-500">{n.body}</div>
                <div className="mt-0.5 text-[10px] text-slate-400">{new Date(n.createdAt).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
