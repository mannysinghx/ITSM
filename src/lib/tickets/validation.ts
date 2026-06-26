import { z } from "zod";

const severity = z.enum(["low", "medium", "high", "critical"]);

export const createTicketSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().min(1).max(20000),
  type: z.string().optional(),
  teamId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  impact: severity.optional(),
  urgency: severity.optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});

export const updateTicketSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().min(1).max(20000).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  impact: severity.optional(),
  urgency: severity.optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});

export const assignSchema = z.object({
  assigneeId: z.string().uuid().nullable(),
});

export const statusSchema = z.object({
  status: z.string().min(1),
});

export const commentSchema = z.object({
  body: z.string().min(1).max(20000),
});
