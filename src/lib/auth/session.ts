import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

const COOKIE = "fd_session";
const TTL_DAYS = 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Creates a server-side session and sets an httpOnly cookie. `sessions` is a global
 * table (not tenant-scoped), so it is accessed via the base client directly.
 */
export async function createSession(userId: string, activeTenantId: string | null, mfaSatisfied = true) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_DAYS * 86_400_000);

  await prisma.session.create({
    data: { userId, activeTenantId, tokenHash: hashToken(token), expiresAt, mfaSatisfied },
  });

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export interface SessionRecord {
  id: string;
  userId: string;
  activeTenantId: string | null;
  mfaSatisfied: boolean;
}

/** Resolves the current session from the cookie, or null. Clears expired sessions. */
export async function getSession(): Promise<SessionRecord | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return {
    id: session.id,
    userId: session.userId,
    activeTenantId: session.activeTenantId,
    mfaSatisfied: session.mfaSatisfied,
  };
}

/** Marks the current session's MFA challenge as satisfied. */
export async function markMfaSatisfied(sessionId: string) {
  await prisma.session.update({ where: { id: sessionId }, data: { mfaSatisfied: true } });
}

export async function setActiveTenant(sessionId: string, tenantId: string) {
  await prisma.session.update({
    where: { id: sessionId },
    data: { activeTenantId: tenantId },
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await prisma.session
      .deleteMany({ where: { tokenHash: hashToken(token) } })
      .catch(() => {});
  }
  jar.delete(COOKIE);
}
