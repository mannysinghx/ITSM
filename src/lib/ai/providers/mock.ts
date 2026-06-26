import { type AIProvider, type AIInput, type AIResult, hash, wordCount } from "@/lib/ai/providers/types";

const TYPES = ["incident", "service_request", "question", "access_request", "problem", "change"];
const PRIORITIES = ["p1", "p2", "p3", "p4"];

function firstSentence(text: string): string {
  const m = text.replace(/\s+/g, " ").trim().match(/^(.{0,160}?[.!?])(\s|$)/);
  return m ? m[1] : text.slice(0, 160);
}

/**
 * Deterministic mock provider (ADR-10). Same input → identical output (keyed on a hash
 * of the prompt) — no clock, no randomness — so the product ships and tests run with no
 * API key. A real adapter implements the same AIProvider interface.
 */
class MockProvider implements AIProvider {
  name = "mock";

  async complete(input: AIInput): Promise<AIResult> {
    const h = hash(`${input.useCase}:${input.prompt}`);
    const lower = input.prompt.toLowerCase();
    let content: unknown;

    switch (input.useCase) {
      case "classify":
        content = { type: TYPES[h % TYPES.length] };
        break;
      case "priority": {
        // Keyword signal first, then deterministic fallback by hash.
        const p = /outage|down|critical|breach|urgent/.test(lower) ? "p1"
          : /slow|degraded|error/.test(lower) ? "p2"
          : PRIORITIES[h % PRIORITIES.length];
        content = { priority: p };
        break;
      }
      case "team": {
        const teams = (input.context?.teams as string[] | undefined) ?? [];
        content = { team: teams.length ? teams[h % teams.length] : "IT Support" };
        break;
      }
      case "summarize":
        content = { summary: `Summary: ${firstSentence(input.prompt)} (auto-generated)` };
        break;
      case "draft":
        content = {
          draft:
            "Thank you for reaching out. We have received your request and are looking " +
            "into it. We will update you with our findings shortly.",
        };
        break;
      case "knowledge":
        content = {
          title: `How to resolve: ${firstSentence(input.prompt).slice(0, 60)}`,
          body:
            `## Overview\n${firstSentence(input.prompt)}\n\n## Resolution\n` +
            `1. Identify the affected component.\n2. Apply the documented fix.\n` +
            `3. Verify and confirm with the requester.\n`,
        };
        break;
    }

    const completion = JSON.stringify(content);
    return {
      content,
      promptTokens: wordCount(input.prompt),
      completionTokens: wordCount(completion),
      costUsd: 0,
      model: input.model ?? "mock-1",
      isMock: true,
    };
  }
}

export const mockProvider: AIProvider = new MockProvider();
