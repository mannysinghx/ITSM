import { createHmac, createHash, randomBytes } from "crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

/** Generates a new base32 TOTP secret. */
export function generateMfaSecret(): string {
  return base32Encode(randomBytes(20));
}

export function otpauthUrl(secret: string, account: string, issuer = "FlowDesk"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** Computes the RFC 6238 TOTP for a given time step. */
export function totp(secret: string, forTime = Date.now(), step = 30): string {
  const counter = Math.floor(forTime / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

/** Verifies a 6-digit code against a ±window time-step tolerance. */
export function verifyTotp(secret: string, code: string, window = 1, now = Date.now()): boolean {
  const c = code.replace(/\s/g, "");
  for (let w = -window; w <= window; w++) {
    if (totp(secret, now + w * 30_000) === c) return true;
  }
  return false;
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Generates N recovery codes; returns plaintext (show once) and hashes (to store). */
export function generateRecoveryCodes(n = 10): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: n }, () => randomBytes(5).toString("hex"));
  return { codes, hashes: codes.map(hashCode) };
}

/** Returns the index of a matching unused recovery code, or -1. */
export function matchRecoveryCode(hashes: string[], code: string): number {
  return hashes.indexOf(hashCode(code.trim()));
}
