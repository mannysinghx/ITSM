"use client";

import { useEffect, useState } from "react";
import { Pill } from "@/components/ui/Pill";
import { SLA_STATE_COLORS, colorFor } from "@/lib/ui/colors";

interface Timer {
  kind: string;
  dueAt: string;
  state: "satisfied" | "breached" | "warning" | "on_track";
}

const STATE_LABEL: Record<string, string> = {
  satisfied: "Met", on_track: "On track", warning: "Warning", breached: "Breached",
};

export function SlaPanel({ ticketId }: { ticketId: string }) {
  const [timers, setTimers] = useState<Timer[] | null>(null);

  useEffect(() => {
    fetch(`/api/tickets/${ticketId}/sla`)
      .then((r) => (r.ok ? r.json() : { timers: [] }))
      .then((d) => setTimers(d.timers ?? []));
  }, [ticketId]);

  if (!timers) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-slate-500">SLA</h3>
        <span className="text-[10px] uppercase tracking-wide text-slate-400">calendar time</span>
      </div>
      {timers.length === 0 ? (
        <p className="text-slate-400">No SLA policy applied.</p>
      ) : (
        <ul className="space-y-2">
          {timers.map((t) => (
            <li key={t.kind} className="flex items-center justify-between">
              <div>
                <div className="capitalize">{t.kind.replace(/_/g, " ")}</div>
                <div className="text-xs text-slate-400">due {new Date(t.dueAt).toLocaleString()}</div>
              </div>
              <Pill color={colorFor(SLA_STATE_COLORS, t.state)} withDot>
                {STATE_LABEL[t.state]}
              </Pill>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
