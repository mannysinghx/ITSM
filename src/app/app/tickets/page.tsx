import { TicketQueue } from "@/components/tickets/TicketQueue";

export default function TicketsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tickets</h1>
      <TicketQueue />
    </div>
  );
}
