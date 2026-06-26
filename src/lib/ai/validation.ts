import { z } from "zod";

export const aiInputSchema = z.object({
  ticketId: z.string().uuid().optional(),
  text: z.string().max(50000).optional(),
});

export const generateArticleSchema = aiInputSchema.extend({
  save: z.boolean().optional(),
});

export const aiSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.string().optional(),
  routing: z.record(z.string()).optional(),
  redaction: z.object({ enabled: z.boolean() }).partial().optional(),
  budget: z.object({ tokenLimit: z.number().int().positive(), windowDays: z.number().int().positive() }).partial().optional(),
  perModule: z.record(z.boolean()).optional(),
  externalAutoResponseAllowed: z.boolean().optional(),
});

export const createKnowledgeSchema = z.object({
  title: z.string().min(1).max(300),
  body: z.string().min(1).max(100000),
  summary: z.string().max(2000).optional(),
  teamId: z.string().uuid().nullable().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

export const updateKnowledgeSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  body: z.string().min(1).max(100000).optional(),
  summary: z.string().max(2000).optional(),
});

export const feedbackSchema = z.object({
  helpful: z.boolean(),
  comment: z.string().max(2000).optional(),
});
