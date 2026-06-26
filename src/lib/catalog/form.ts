import { z } from "zod";

/** A field in a form_definition schema (master spec §13 field types). */
export interface FormField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
  validation?: Record<string, unknown>;
}

export interface FormSchema {
  fields: FormField[];
}

/** Builds a Zod object schema from a form definition for server-side validation. */
export function buildZod(schema: FormSchema): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of schema.fields ?? []) {
    let zt: z.ZodTypeAny;
    switch (f.type) {
      case "number":
      case "currency":
        zt = z.coerce.number();
        break;
      case "checkbox":
        zt = z.coerce.boolean();
        break;
      case "multi_select":
        zt = z.array(z.string());
        break;
      case "email":
        zt = z.string().email();
        break;
      case "url":
        zt = z.string().url();
        break;
      case "user_picker":
      case "team_picker":
      case "asset_picker":
        zt = z.string().uuid();
        break;
      case "dropdown":
        zt = f.options?.length ? z.enum(f.options as [string, ...string[]]) : z.string();
        break;
      default:
        // text, textarea, date, datetime, phone, rich_text, attachment (reference)
        zt = z.string();
    }
    shape[f.key] = f.required ? zt : zt.optional();
  }
  return z.object(shape).strip();
}

/** Parses a JSON form schema into a typed FormSchema (defensive). */
export function asFormSchema(raw: unknown): FormSchema {
  const obj = (raw ?? {}) as { fields?: FormField[] };
  return { fields: Array.isArray(obj.fields) ? obj.fields : [] };
}

/** Compiles submitted values into a human-readable ticket description. */
export function valuesToDescription(schema: FormSchema, values: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const f of schema.fields) {
    if (values[f.key] === undefined || values[f.key] === "") continue;
    const v = values[f.key];
    lines.push(`${f.label}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
  }
  return lines.join("\n") || "(no details provided)";
}
