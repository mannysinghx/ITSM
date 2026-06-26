import type { Tx } from "@/lib/db";
import { withTenant } from "@/lib/db";
import type { AuthContext } from "@/lib/authz";
import { emailTransport } from "@/lib/notifications/email";

export interface Recipient {
  userId: string;
  email?: string | null;
}

export interface NotifyInput {
  tenantId: string;
  type: string; // ticket_assigned | sla_warning | sla_breached | task_due | ...
  recipients: Recipient[];
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
}

/**
 * Creates in-app notification rows and dispatches mock emails, honoring each
 * recipient's notification_preferences (default-on when no row). MUST be called inside
 * the caller's `withTenant` tx so notifications commit with the triggering change.
 */
export async function notify(tx: Tx, input: NotifyInput): Promise<number> {
  if (input.recipients.length === 0) return 0;
  const userIds = Array.from(new Set(input.recipients.map((r) => r.userId)));

  const prefs = await tx.notificationPreference.findMany({
    where: { userId: { in: userIds }, eventType: input.type },
  });
  const prefByUser = new Map(prefs.map((p) => [p.userId, p]));

  let created = 0;
  for (const r of input.recipients) {
    const pref = prefByUser.get(r.userId);
    const inApp = pref?.inApp ?? true;
    const email = pref?.email ?? true;

    if (inApp) {
      await tx.notification.create({
        data: {
          tenantId: input.tenantId,
          userId: r.userId,
          title: input.title,
          body: input.body,
          type: input.type,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
        },
      });
      created++;
    }
    if (email && r.email) {
      await emailTransport.send({ to: r.email, subject: input.title, body: input.body });
    }
  }
  return created;
}

export async function listNotifications(ctx: AuthContext) {
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    const items = await tx.notification.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const unread = items.filter((n) => !n.readAt).length;
    return { items, unread };
  });
}

export async function markRead(ctx: AuthContext, id: string) {
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    await tx.notification.updateMany({
      where: { id, userId: ctx.userId },
      data: { readAt: new Date() },
    });
    return { ok: true };
  });
}

export async function markAllRead(ctx: AuthContext) {
  return withTenant(ctx.tenantId, ctx.userId, async (tx) => {
    await tx.notification.updateMany({
      where: { userId: ctx.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  });
}
