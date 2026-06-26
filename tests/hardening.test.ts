import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma, withTenant } from "@/lib/db";
import { ensureSystemRolesAndPermissions } from "@/lib/bootstrap";
import { provisionCompany } from "@/lib/provisioning";
import { PERMISSION_KEYS } from "@/lib/permissions";
import type { AuthContext } from "@/lib/authz";
import { hashPassword } from "@/lib/auth/password";
import { authenticate } from "@/lib/auth/login";
import { beginEnroll, confirmEnroll, verifyMfaCode, consumeRecoveryCode } from "@/lib/auth/mfa-service";
import { totp } from "@/lib/auth/mfa";
import { requestEmailVerification, confirmEmailVerification, requestPasswordReset, confirmPasswordReset } from "@/lib/auth/email-flows";
import { createTeam } from "@/lib/admin/teams";

const uniq = () => `${randomUUID()}@test.local`;
beforeAll(async () => { await ensureSystemRolesAndPermissions(); });
afterAll(async () => { await prisma.$disconnect(); });

async function makeUser(password = "password123") {
  return prisma.user.create({ data: { name: "U", email: uniq(), passwordHash: await hashPassword(password) } });
}

describe("brute-force protection", () => {
  it("locks the account after 5 failed attempts", async () => {
    const user = await makeUser("correct-horse");
    for (let i = 0; i < 4; i++) {
      expect((await authenticate(user.email, "wrong")).ok).toBe(false);
    }
    // 5th failure trips the lock.
    const fifth = await authenticate(user.email, "wrong");
    expect(fifth).toEqual({ ok: false, reason: "locked" });
    // Even the correct password is refused while locked.
    expect((await authenticate(user.email, "correct-horse"))).toEqual({ ok: false, reason: "locked" });
  });

  it("a correct password resets the failure counter", async () => {
    const user = await makeUser("right");
    await authenticate(user.email, "wrong");
    await authenticate(user.email, "wrong");
    const okres = await authenticate(user.email, "right");
    expect(okres.ok).toBe(true);
    const after = await prisma.user.findUnique({ where: { id: user.id }, select: { failedLoginCount: true } });
    expect(after?.failedLoginCount).toBe(0);
  });
});

describe("MFA (TOTP + recovery)", () => {
  it("enrolls, verifies codes, and consumes a recovery code", async () => {
    const user = await makeUser();
    const { secret } = await beginEnroll(user.id);
    const { recoveryCodes } = await confirmEnroll(user.id, totp(secret));
    expect(recoveryCodes).toHaveLength(10);

    expect(await verifyMfaCode(user.id, totp(secret))).toBe(true);
    expect(await verifyMfaCode(user.id, "000000")).toBe(false);

    // A recovery code works once, then is consumed.
    expect(await consumeRecoveryCode(user.id, recoveryCodes[0])).toBe(true);
    expect(await consumeRecoveryCode(user.id, recoveryCodes[0])).toBe(false);
  });
});

describe("email verification + password reset", () => {
  it("verifies email via a single-use token", async () => {
    const user = await makeUser();
    const { token } = await requestEmailVerification(user.id);
    await confirmEmailVerification(token);
    const after = await prisma.user.findUnique({ where: { id: user.id }, select: { emailVerified: true } });
    expect(after?.emailVerified).toBe(true);
    // token is single-use
    await expect(confirmEmailVerification(token)).rejects.toThrow();
  });

  it("resets a password and lets the user log in with it", async () => {
    const user = await makeUser("oldpassword");
    const r = await requestPasswordReset(user.email);
    expect(r.token).toBeTruthy();
    await confirmPasswordReset(r.token!, "brandnewpass");
    expect((await authenticate(user.email, "oldpassword")).ok).toBe(false);
    expect((await authenticate(user.email, "brandnewpass")).ok).toBe(true);
  });

  it("password reset does not reveal unknown emails", async () => {
    const r = await requestPasswordReset("nobody@nowhere.test");
    expect(r.sent).toBe(true);
    expect(r.token).toBeUndefined();
  });
});

describe("plan limit enforcement (§18.14)", () => {
  it("blocks team creation once the free-plan limit is reached", async () => {
    const { tenantId, userId } = await provisionCompany({ name: "O", email: uniq(), companyName: "LimitCo", password: "password123" });
    const ctx: AuthContext = { userId, tenantId, teamIds: [], permissionKeys: new Set(PERMISSION_KEYS) };
    // Company starts with 2 default teams; free limit is 3.
    await createTeam(ctx, "Third team"); // ok -> 3 teams
    await expect(createTeam(ctx, "Fourth team")).rejects.toThrow(/limit/i);
  });
});
