import { z } from "zod";

export const individualSignupSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
});

export const companySignupSchema = individualSignupSchema.extend({
  companyName: z.string().min(1).max(160),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type IndividualSignupInput = z.infer<typeof individualSignupSchema>;
export type CompanySignupInput = z.infer<typeof companySignupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/** URL-safe slug from a display name, with a short random suffix for uniqueness. */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 7);
  return base ? `${base}-${suffix}` : `t-${suffix}`;
}
