import Link from "next/link";
import { CreateTicketForm } from "@/components/tickets/CreateTicketForm";

export default function NewTicketPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/app/tickets" className="hover:underline">Tickets</Link>
        <span>/</span>
        <span>New</span>
      </div>
      <h1 className="text-2xl font-bold">Create ticket</h1>
      <CreateTicketForm />
    </div>
  );
}
