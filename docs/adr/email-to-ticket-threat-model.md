# Email-to-Ticket — Threat Model (sign-off gate for Phase 7)

Inbound email is an untrusted, attacker-reachable channel. Email-to-ticket ships only
behind the mitigations below (referenced from `PHASE-7-integrations.md`, task 7).

## Threats & mitigations

| # | Threat | Mitigation (MVP) |
|---|--------|------------------|
| T1 | **Sender spoofing** — forged `From` to impersonate a staff/requester | Capture SPF/DKIM/DMARC results from the inbound gateway; **reject** when DMARC fails (or SPF+DKIM both fail). Stored in `email_messages.spoofCheck`. |
| T2 | **Header injection** (CRLF) to forge threading/routing | Treat `messageId`/`inReplyTo`/`subject` as opaque strings; never reflect into outbound headers unescaped; thread match is an exact-string lookup, not eval. |
| T3 | **HTML / markdown injection / stored XSS** | Persist `bodyHtml` raw but never render it as HTML in-app; the ticket description is built from `bodyText` only. Rich rendering is sanitized at the render layer (deferred). |
| T4 | **Malicious attachments** | Attachments are stored via the `Storage` abstraction with a scanning **hook** (no-op in MVP, real AV scanner is a later layer); never executed; size-capped. |
| T5 | **Unauthorized tenant injection** | The inbound endpoint resolves the tenant from the **mailbox/recipient mapping**, never from the email body or a client-supplied tenant id (ADR-2 IDOR guard). |
| T6 | **Spam / abuse / mail-bomb** | Allowed-senders + blocklist per tenant; rate limiting at the gateway (Phase 8). Unknown senders are dropped, not auto-provisioned. |
| T7 | **Reply-loop / auto-responder storms** | Auto-reply suppression on `Auto-Submitted`/`Precedence: bulk` headers; threading dedupe by `messageId`. |

## MVP posture

- DMARC-fail mail is **rejected** (not turned into a ticket).
- Tenant is derived server-side from the recipient mapping.
- Description uses `bodyText`; `bodyHtml` is stored but not rendered as HTML.
- Allowed-senders/blocklist enforced; unknown senders rejected.
- Attachment scanning is a hook (no-op) — real AV is deferred and noted, not silently skipped.

**Sign-off:** mitigations T1, T2, T5, T6 enforced in `lib/integrations/email.ts`; T3, T4, T7
are partial with explicit deferrals above. This satisfies the Phase-7 gate to ship a
guarded MVP.
