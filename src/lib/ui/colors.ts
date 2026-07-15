/**
 * Central color tokens for every "type"-like enum in the product (ticket type,
 * priority, status category, severity, category, knowledge status/source, task
 * status, approval status, run status). One place to keep colors distinct and
 * consistent instead of re-picking shades per component.
 */

export interface ColorToken {
  /** Soft pill background/text/ring, for badges. */
  pill: string;
  /** Solid dot, for compact indicators (kanban cards, legends). */
  dot: string;
}

const SLATE: ColorToken = {
  pill: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-600/10",
  dot: "bg-slate-400",
};

// Tailwind needs full literal class names to scan — keep one token per color
// spelled out so nothing gets purged.
const TOKENS: Record<string, ColorToken> = {
  rose: { pill: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20", dot: "bg-rose-500" },
  red: { pill: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20", dot: "bg-red-500" },
  orange: { pill: "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/20", dot: "bg-orange-500" },
  amber: { pill: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20", dot: "bg-amber-500" },
  yellow: { pill: "bg-yellow-50 text-yellow-700 ring-1 ring-inset ring-yellow-600/20", dot: "bg-yellow-500" },
  lime: { pill: "bg-lime-50 text-lime-700 ring-1 ring-inset ring-lime-600/20", dot: "bg-lime-500" },
  emerald: { pill: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20", dot: "bg-emerald-500" },
  green: { pill: "bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20", dot: "bg-green-500" },
  teal: { pill: "bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-600/20", dot: "bg-teal-500" },
  cyan: { pill: "bg-cyan-50 text-cyan-700 ring-1 ring-inset ring-cyan-600/20", dot: "bg-cyan-500" },
  sky: { pill: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20", dot: "bg-sky-500" },
  blue: { pill: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20", dot: "bg-blue-500" },
  indigo: { pill: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20", dot: "bg-indigo-500" },
  violet: { pill: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/20", dot: "bg-violet-500" },
  purple: { pill: "bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-600/20", dot: "bg-purple-500" },
  fuchsia: { pill: "bg-fuchsia-50 text-fuchsia-700 ring-1 ring-inset ring-fuchsia-600/20", dot: "bg-fuchsia-500" },
  pink: { pill: "bg-pink-50 text-pink-700 ring-1 ring-inset ring-pink-600/20", dot: "bg-pink-500" },
  slate: SLATE,
};

/** P1 (critical) → P4 (low), red through slate. */
export const PRIORITY_COLORS: Record<string, ColorToken> = {
  p1: TOKENS.red,
  p2: TOKENS.orange,
  p3: TOKENS.amber,
  p4: TOKENS.sky,
};

export const SEVERITY_COLORS: Record<string, ColorToken> = {
  critical: TOKENS.red,
  high: TOKENS.orange,
  medium: TOKENS.amber,
  low: TOKENS.emerald,
};

export const STATUS_CATEGORY_COLORS: Record<string, ColorToken> = {
  open: TOKENS.blue,
  pending: TOKENS.purple,
  resolved: TOKENS.green,
  closed: TOKENS.slate,
  cancelled: TOKENS.rose,
};

/** One distinct hue per ticket type key (src/lib/tickets/config.ts TYPES). */
export const TICKET_TYPE_COLORS: Record<string, ColorToken> = {
  incident: TOKENS.rose,
  service_request: TOKENS.blue,
  task: TOKENS.cyan,
  problem: TOKENS.orange,
  change: TOKENS.violet,
  alert: TOKENS.red,
  question: TOKENS.teal,
  access_request: TOKENS.indigo,
  procurement_request: TOKENS.amber,
  onboarding_request: TOKENS.emerald,
  offboarding_request: TOKENS.slate,
  security_event: TOKENS.fuchsia,
};

/** One distinct hue per ticket category (src/lib/tickets/config.ts CATEGORIES). */
export const TICKET_CATEGORY_COLORS: Record<string, ColorToken> = {
  Hardware: TOKENS.amber,
  Software: TOKENS.sky,
  Network: TOKENS.emerald,
  Access: TOKENS.indigo,
  Email: TOKENS.purple,
  Security: TOKENS.red,
};

export const KNOWLEDGE_STATUS_COLORS: Record<string, ColorToken> = {
  draft: TOKENS.amber,
  published: TOKENS.green,
  archived: TOKENS.slate,
};

export const KNOWLEDGE_SOURCE_COLORS: Record<string, ColorToken> = {
  human: TOKENS.blue,
  ai: TOKENS.violet,
  ticket: TOKENS.slate,
};

export const TASK_STATUS_COLORS: Record<string, ColorToken> = {
  todo: TOKENS.slate,
  in_progress: TOKENS.blue,
  blocked: TOKENS.red,
  done: TOKENS.green,
  cancelled: TOKENS.rose,
};

export const APPROVAL_STATUS_COLORS: Record<string, ColorToken> = {
  pending: TOKENS.amber,
  approved: TOKENS.green,
  rejected: TOKENS.red,
  skipped: TOKENS.slate,
};

export const SLA_STATE_COLORS: Record<string, ColorToken> = {
  satisfied: TOKENS.green,
  on_track: TOKENS.blue,
  warning: TOKENS.amber,
  breached: TOKENS.red,
};

export const RUN_STATUS_COLORS: Record<string, ColorToken> = {
  matched: TOKENS.blue,
  completed: TOKENS.green,
  skipped: TOKENS.amber,
  deferred: TOKENS.amber,
  failed: TOKENS.red,
};

export const STEP_STATUS_COLORS: Record<string, ColorToken> = {
  ok: TOKENS.green,
  deferred: TOKENS.amber,
  error: TOKENS.red,
};

/** Generic on/off, active/inactive, valid/revoked toggle states. */
export const ACTIVE_STATE_COLORS: Record<string, ColorToken> = {
  active: TOKENS.green,
  enabled: TOKENS.green,
  inactive: TOKENS.slate,
  disabled: TOKENS.slate,
  revoked: TOKENS.red,
};

export function colorFor(map: Record<string, ColorToken>, key: string): ColorToken {
  return map[key] ?? SLATE;
}
