import { prisma } from "@/lib/db";
import { generateMfaSecret, otpauthUrl, verifyTotp, generateRecoveryCodes, matchRecoveryCode } from "@/lib/auth/mfa";
import { ValidationError, NotFoundError } from "@/lib/errors";

/** Step 1: generate a secret (stored but not yet enabled) and return the enrolment URL. */
export async function beginEnroll(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) throw new NotFoundError("User not found");
  const secret = generateMfaSecret();
  await prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret, mfaEnabled: false } });
  return { secret, otpauthUrl: otpauthUrl(secret, user.email) };
}

/** Step 2: verify the first code, enable MFA, and issue recovery codes (shown once). */
export async function confirmEnroll(userId: string, code: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { mfaSecret: true } });
  if (!user?.mfaSecret) throw new ValidationError("No enrolment in progress");
  if (!verifyTotp(user.mfaSecret, code)) throw new ValidationError("Invalid code");
  const { codes, hashes } = generateRecoveryCodes();
  await prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true, mfaRecoveryCodes: hashes as object } });
  return { recoveryCodes: codes };
}

/** Login challenge: verify a TOTP code for an MFA-enabled user. */
export async function verifyMfaCode(userId: string, code: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { mfaEnabled: true, mfaSecret: true } });
  if (!user?.mfaEnabled || !user.mfaSecret) return false;
  return verifyTotp(user.mfaSecret, code);
}

/** Login challenge fallback: consume a single recovery code. */
export async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { mfaRecoveryCodes: true } });
  const hashes = (user?.mfaRecoveryCodes as string[] | null) ?? [];
  const idx = matchRecoveryCode(hashes, code);
  if (idx === -1) return false;
  hashes.splice(idx, 1);
  await prisma.user.update({ where: { id: userId }, data: { mfaRecoveryCodes: hashes as object } });
  return true;
}

export async function disableMfa(userId: string, code: string) {
  if (!(await verifyMfaCode(userId, code))) throw new ValidationError("Invalid code");
  await prisma.user.update({
    where: { id: userId },
    data: { mfaEnabled: false, mfaSecret: null, mfaRecoveryCodes: undefined },
  });
  return { ok: true };
}
