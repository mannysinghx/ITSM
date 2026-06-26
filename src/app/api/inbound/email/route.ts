import { z } from "zod";
import { ingestEmail, resolveMailbox, type InboundEmail } from "@/lib/integrations/email";
import { ok, handleError } from "@/lib/api";

const schema = z.object({
  recipient: z.string().email(),
  messageId: z.string(),
  inReplyTo: z.string().optional(),
  from: z.string(),
  to: z.array(z.string()).default([]),
  subject: z.string().default(""),
  bodyText: z.string().default(""),
  bodyHtml: z.string().optional(),
  spoof: z.object({ spf: z.string().optional(), dkim: z.string().optional(), dmarc: z.string().optional() }).optional(),
  attachments: z.array(z.object({ filename: z.string(), contentType: z.string(), size: z.number() })).optional(),
});

/**
 * Inbound mailbox webhook → email-to-ticket. Unauthenticated transport, but gated by the
 * threat-model: tenant is resolved server-side from the recipient (never the body, ADR-2),
 * and DMARC-fail / blocklisted / non-allowed senders are rejected inside ingestEmail.
 */
export async function POST(req: Request) {
  try {
    const payload = schema.parse(await req.json());
    const systemCtx = await resolveMailbox(payload.recipient);
    const email: InboundEmail = { ...payload };
    const result = await ingestEmail(systemCtx, email, {});
    return ok(result, result.created ? 201 : 200);
  } catch (e) {
    return handleError(e);
  }
}
