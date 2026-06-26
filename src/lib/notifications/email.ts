/**
 * Email abstraction (ADR-9, ADR-10). MVP uses a mock transport — no SMTP. Swapping in
 * a real provider later means implementing `EmailTransport`, not touching callers.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export interface EmailTransport {
  send(msg: EmailMessage): Promise<void>;
}

class MockTransport implements EmailTransport {
  async send(msg: EmailMessage): Promise<void> {
    if (process.env.NODE_ENV !== "test") {
      console.log(`[mock-email] → ${msg.to}: ${msg.subject}`);
    }
  }
}

export const emailTransport: EmailTransport = new MockTransport();
