import { z } from "zod";

export const inviteUserSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  roleId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
});

export const userActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("suspend") }),
  z.object({ action: z.literal("reactivate") }),
  z.object({ action: z.literal("assignRole"), roleId: z.string().uuid(), teamId: z.string().uuid().optional() }),
  z.object({ action: z.literal("assignTeam"), teamId: z.string().uuid(), roleId: z.string().uuid().optional() }),
]);

export const createTeamSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(500).optional(),
});

export const teamActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), name: z.string().min(1).optional(), description: z.string().nullable().optional() }),
  z.object({ action: z.literal("archive") }),
  z.object({ action: z.literal("addMember"), userId: z.string().uuid(), roleId: z.string().uuid().optional() }),
  z.object({ action: z.literal("removeMember"), userId: z.string().uuid() }),
]);

export const createRoleSchema = z.object({
  name: z.string().min(1).max(120),
  permissionKeys: z.array(z.string()).min(1),
});

export const updateRoleSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  permissionKeys: z.array(z.string()).optional(),
  cloneFrom: z.string().uuid().optional(),
});

export const configMutationSchema = z.object({
  resource: z.enum(["type", "status", "matrix", "category", "field"]),
  op: z.enum(["create", "update", "delete"]),
  id: z.string().uuid().optional(),
  data: z.record(z.unknown()).optional(),
});
