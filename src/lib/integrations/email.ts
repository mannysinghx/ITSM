import { withTenant } from "@/lib/db";
import type { AuthContext } from "@/lib/authz";
import { createTicketTx } from "@/lib/tickets/service";
import { safeEmit } from "@/lib/automation/engine";
import { ValidationError, NotFoundError } from "@/lib/errors";

/** Inbound email payload from the mailbox gateway (already SPF/DKIM/DMARC-checked). */
export interface InboundEmail {
  messageId: string;
  inReplyTo?: string;
  from: string;
  to: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  headers?: Record<string, string>;
  spoof?: { spf?: string; dkim?: string; dmarc?: string };
  attachments?: { filename: string; contentType: string; size: number }[];
}

/** Strips a common signature delimiter ("-- ") and trailing quoted replies. */
function stripSignature(text: string): string {
  return text.split(/\n-- ?\n/)[0].split(/\nOn .* wrote:\n/)[0].trim();
}

/**
 * Converts an inbound email into a ticket (or threads onto an existing one). Enforces the
 * threat-model gate (docs/adr/email-to-ticket-threat-model.md): DMARC-fail is rejected,
 * unknown senders blocked, tenant resolved server-side (never from the body). bodyText
 * only is used for the description (T3). Must be given the resolved tenant + a system
 * AuthContext for that tenant (T5 — tenant never from payload).
 */
export async function ingestEmail(
  systemCtx: AuthContext,
  email: InboundEmail,
  policy: { allowedSenders?: string[]; blocklist?: string[]; defaultTeamId?: string },
): Promise<{ ticketId: string; threadId: string; created: boolean }> {
  // T1: reject spoofed mail.
  if (email.spoof?.dmarc && email.spoof.dmarc.toLowerCase() === "fail") {
    throw new ValidationError("Rejected: DMARC failed (possible spoofing)");
  }
  // T6: allowed-senders / blocklist.
  const from = email.from.toLowerCase();
  if (policy.blocklist?.some((b) => from.includes(b.toLowerCase()))) {
    throw new ValidationError("Rejected: sender is blocklisted");
  }
  if (policy.allowedSenders && policy.allowedSenders.length > 0 &&
      !policy.allowedSenders.some((a) => from.includes(a.toLowerCase()))) {
    throw new ValidationError("Rejected: sender not in allowed list");
  }

  const result = await withTenant(systemCtx.tenantId, systemCtx.userId, async (tx) => {
    // Thread by inReplyTo → existing thread → existing ticket.
    let thread = email.inReplyTo
      ? await tx.emailThread.findFirst({ where: { messages: { some: { messageId: email.inReplyTo } } } })
      : null;

    let ticketId: string;
    let created = false;

    if (thread?.ticketId) {
      ticketId = thread.ticketId;
      await tx.ticketComment.create({
        data: { tenantId: systemCtx.tenantId, ticketId, authorId: systemCtx.userId, body: stripSignature(email.bodyText), isInternal: false },
      });
    } else {
      const ticket = await createTicketTx(
        tx, systemCtx,
        {
          title: email.subject || "(no subject)",
          description: stripSignature(email.bodyText),
          type: "incident",
          teamId: policy.defaultTeamId,
          source: "email",
          channel: from,
        },
        { allowAnyTeam: true },
      );
      ticketId = ticket.id;
      created = true;
      thread = await tx.emailThread.create({
        data: {
          tenantId: systemCtx.tenantId, ticketId, externalThreadId: email.messageId,
          subject: email.subject, participants: [email.from, ...email.to] as object, status: "open",
        },
      });
    }

    await tx.emailMessage.create({
      data: {
        tenantId: systemCtx.tenantId, threadId: thread.id, direction: "in",
        messageId: email.messageId, inReplyTo: email.inReplyTo ?? null,
        fromAddr: email.from, toAddrs: email.to as object,
        bodyText: email.bodyText, bodyHtml: email.bodyHtml ?? null,
        headers: (email.headers ?? {}) as object, spoofCheck: (email.spoof ?? {}) as object,
        attachments: (email.attachments ?? []) as object,
      },
    });

    return { ticketId, threadId: thread.id, created };
  });

  if (result.created) {
    await safeEmit(systemCtx.tenantId, { event: "ticket.created", entityType: "ticket", entityId: result.ticketId, actorId: systemCtx.userId });
  } else {
    await safeEmit(systemCtx.tenantId, { event: "comment.created", entityType: "ticket", entityId: result.ticketId, actorId: systemCtx.userId });
  }
  return result;
}

/** Resolves the tenant + a system actor for an inbound mailbox address (T5). Reads the
 *  global mailbox_routes table (NOT RLS) — the tenant is never taken from the payload. */
export async function resolveMailbox(recipient: string): Promise<AuthContext> {
  const { prisma } = await import("@/lib/db");
  const route = await prisma.mailboxRoute.findUnique({ where: { mailbox: recipient.toLowerCase() } });
  if (!route) throw new NotFoundError("No mailbox mapping for recipient");
  const { PERMISSION_KEYS } = await import("@/lib/permissions");
  return { userId: route.ownerUserId, tenantId: route.tenantId, teamIds: [], permissionKeys: new Set(PERMISSION_KEYS) };
}
