import type { AIProvider, UseCase } from "@/lib/ai/providers/types";
import { mockProvider } from "@/lib/ai/providers/mock";
import type { AiSettings } from "@/lib/ai/settings";

/** True only when a real provider key is configured. MVP ships without one. */
export function hasApiKey(): boolean {
  return Boolean(process.env.AI_API_KEY);
}

/**
 * Model router (master spec §22.3): use_case → (provider, model). Falls back to the
 * deterministic mock whenever no API key is present, so behavior is identical in dev,
 * test, and unconfigured production. A real adapter would be selected here when keyed.
 */
export function route(useCase: UseCase, settings: AiSettings): { provider: AIProvider; model: string } {
  const model = settings.routing[useCase] ?? defaultModel(useCase);
  // No key → mock. (Real-provider selection is a post-MVP hook, ADR-10.)
  if (!hasApiKey() || settings.provider === "mock") {
    return { provider: mockProvider, model: "mock-1" };
  }
  return { provider: mockProvider, model }; // real adapter slots in here when implemented
}

function defaultModel(useCase: UseCase): string {
  // Cheap for classification, stronger for generation (§22.3).
  return useCase === "classify" || useCase === "priority" || useCase === "team"
    ? "cheap-1"
    : "quality-1";
}
