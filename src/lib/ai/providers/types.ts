export type UseCase = "classify" | "priority" | "team" | "summarize" | "draft" | "knowledge";

export interface AIInput {
  useCase: UseCase;
  prompt: string;
  model?: string;
  context?: Record<string, unknown>;
}

export interface AIResult {
  content: unknown;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  model: string;
  isMock: boolean;
}

export interface AIProvider {
  name: string;
  complete(input: AIInput): Promise<AIResult>;
}

/** Deterministic non-negative hash (djb2) — no clock/random, so mock output is stable. */
export function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

export function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}
