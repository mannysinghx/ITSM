import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Creates a single-use, expiring token (global auth_tokens). Returns the raw token. */
export async function createAuthToken(userId: string, purpose: string, ttlMs: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.authToken.create({
    data: { userId, purpose, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs) },
  });
  return token;
}

/** Consumes a token if valid (right purpose, unused, unexpired). Returns the userId or null. */
export async function consumeAuthToken(token: string, purpose: string): Promise<string | null> {
  const row = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt < new Date()) return null;
  await prisma.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return row.userId;
}
