import { z } from "zod";

export const submitSchema = z.object({
  values: z.record(z.unknown()).default({}),
});

export const approvalDecisionSchema = z.object({
  comment: z.string().max(2000).optional(),
});

const priority = z.enum(["p1", "p2", "p3", "p4"]);
const visibility = z.enum(["public", "internal", "team"]);

export const catalogItemSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.string().max(120).optional(),
  teamId: z.string().uuid().nullable().optional(),
  formDefinitionId: z.string().uuid().nullable().optional(),
  defaultPriority: priority.optional(),
  defaultSlaPolicyId: z.string().uuid().nullable().optional(),
  approvalRequired: z.boolean().optional(),
  approvalChain: z.array(z.record(z.unknown())).optional(),
  routingRule: z.record(z.unknown()).optional(),
  visibility: visibility.optional(),
  status: z.string().optional(),
});

export const catalogItemUpdateSchema = catalogItemSchema.partial();

export const formSchema = z.object({
  name: z.string().min(1).max(200),
  schema: z.object({ fields: z.array(z.record(z.unknown())) }).optional(),
});

export const formUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  schema: z.object({ fields: z.array(z.record(z.unknown())) }).optional(),
});
