/**
 * Pure condition evaluator (master spec §23). IO-free so it is unit-testable. A rule's
 * conditions are ANDed; each condition compares a field of the entity snapshot.
 */
export interface Condition {
  field: string;
  operator:
    | "equals" | "not_equals" | "contains" | "in"
    | "gt" | "lt" | "is_set" | "is_empty";
  value?: unknown;
}

export type EntitySnapshot = Record<string, unknown>;

function get(entity: EntitySnapshot, field: string): unknown {
  // Supports dotted paths like "status.key".
  return field.split(".").reduce<unknown>((acc, k) => (acc == null ? undefined : (acc as Record<string, unknown>)[k]), entity);
}

export function evaluateCondition(entity: EntitySnapshot, c: Condition): boolean {
  const actual = get(entity, c.field);
  switch (c.operator) {
    case "equals": return actual === c.value;
    case "not_equals": return actual !== c.value;
    case "contains":
      return typeof actual === "string" && typeof c.value === "string" && actual.toLowerCase().includes(c.value.toLowerCase())
        || Array.isArray(actual) && actual.includes(c.value);
    case "in": return Array.isArray(c.value) && c.value.includes(actual);
    case "gt": return typeof actual === "number" && typeof c.value === "number" && actual > c.value;
    case "lt": return typeof actual === "number" && typeof c.value === "number" && actual < c.value;
    case "is_set": return actual !== null && actual !== undefined && actual !== "";
    case "is_empty": return actual === null || actual === undefined || actual === "";
    default: return false;
  }
}

/** All conditions must pass (AND). An empty condition list always matches. */
export function evaluateConditions(entity: EntitySnapshot, conditions: Condition[]): boolean {
  return conditions.every((c) => evaluateCondition(entity, c));
}
