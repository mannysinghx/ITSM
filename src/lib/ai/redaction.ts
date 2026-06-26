/**
 * PII redaction (ADR: redaction-by-default). Applied to every prompt BEFORE it leaves
 * the process when the tenant has redaction enabled. Returns the scrubbed text and
 * whether anything was redacted.
 */
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;
const SECRET = /\b(?:sk|pk|api[_-]?key|token|secret|password)[-_]?\s*[:=]\s*\S{4,}/gi;

export function redact(text: string): { text: string; redacted: boolean } {
  let redacted = false;
  let out = text.replace(SECRET, () => { redacted = true; return "[REDACTED_SECRET]"; });
  out = out.replace(EMAIL, () => { redacted = true; return "[REDACTED_EMAIL]"; });
  out = out.replace(PHONE, () => { redacted = true; return "[REDACTED_PHONE]"; });
  return { text: out, redacted };
}
