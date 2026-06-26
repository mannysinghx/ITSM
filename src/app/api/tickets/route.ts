import { requireAuth } from "@/lib/auth/require";
import { createTicket, listTickets } from "@/lib/tickets/service";
import { createTicketSchema } from "@/lib/tickets/validation";
import { ok, handleError } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const url = new URL(req.url);
    const tickets = await listTickets(ctx, {
      statusKey: url.searchParams.get("status") ?? undefined,
      typeKey: url.searchParams.get("type") ?? undefined,
      priority: url.searchParams.get("priority") ?? undefined,
      assigneeId: url.searchParams.get("assignee") ?? undefined,
      teamId: url.searchParams.get("team") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
    });
    return ok({ tickets });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const input = createTicketSchema.parse(await req.json());
    const ticket = await createTicket(ctx, input);
    return ok({ id: ticket.id, ticketNumber: ticket.ticketNumber }, 201);
  } catch (e) {
    return handleError(e);
  }
}
