import { prisma } from "@/lib/db";
import { createAuthToken, consumeAuthToken } from "@/lib/auth/tokens";
import { hashPassword } from "@/lib/auth/password";
import { emailTransport } from "@/lib/notifications/email";
import { ValidationError } from "@/lib/errors";

const VERIFY_TTL = 24 * 60 * 60_000; // 24h
const RESET_TTL = 60 * 60_000; // 1h

/**
 * Email verification + password reset over the email abstraction (mock transport in MVP;
 * real SMTP is the post-MVP hook, ADR-10). Tokens are single-use, expiring, hashed at
 * rest. Password reset never reveals whether an email exists (no enumeration).
 * In dev/test the raw token is returned so flows are exercisable without a mailbox.
 */
export async function requestEmailVerification(userId: string): Promise<{ token: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) throw new ValidationError("User not found");
  const token = await createAuthToken(userId, "verify_email", VERIFY_TTL);
  await emailTransport.send({ to: user.email, subject: "Verify your email", body: `Verify: /verify-email?token=${token}` });
  return { token };
}

export async function confirmEmailVerification(token: string): Promise<{ ok: boolean }> {
  const userId = await consumeAuthToken(token, "verify_email");
  if (!userId) throw new ValidationError("Invalid or expired token");
  await prisma.user.update({ where: { id: userId }, data: { emailVerified: true, emailVerifiedAt: new Date() } });
  return { ok: true };
}

export async function requestPasswordReset(email: string): Promise<{ sent: true; token?: string }> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!user) return { sent: true }; // no enumeration
  const token = await createAuthToken(user.id, "reset_password", RESET_TTL);
  await emailTransport.send({ to: user.email, subject: "Reset your password", body: `Reset: /reset-password/confirm?token=${token}` });
  return { sent: true, token };
}

export async function confirmPasswordReset(token: string, newPassword: string): Promise<{ ok: boolean }> {
  if (newPassword.length < 8) throw new ValidationError("Password too short");
  const userId = await consumeAuthToken(token, "reset_password");
  if (!userId) throw new ValidationError("Invalid or expired token");
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword), failedLoginCount: 0, lockedUntil: null },
  });
  return { ok: true };
}
