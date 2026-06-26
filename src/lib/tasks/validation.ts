import { z } from "zod";

const status = z.enum(["todo", "in_progress", "blocked", "done", "cancelled"]);
const priority = z.enum(["p1", "p2", "p3", "p4"]);

export const createTaskSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(20000).optional(),
  teamId: z.string().uuid().optional(),
  ticketId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  priority: priority.optional(),
  dueAt: z.string().datetime().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(20000).optional(),
  status: status.optional(),
  priority: priority.optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

export const taskCommentSchema = z.object({ body: z.string().min(1).max(20000) });
