import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6">
      <span className="text-sm font-semibold uppercase tracking-widest text-brand">
        FlowDesk ITSM
      </span>
      <h1 className="mt-3 text-4xl font-bold tracking-tight">
        Multi-tenant ITSM, isolated by design.
      </h1>
      <p className="mt-4 max-w-xl text-lg text-slate-600">
        Tickets, tasks, teams, and role-based access for individuals and companies —
        with tenant isolation enforced at the database, not just in the UI.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/signup"
          className="rounded-md bg-brand px-5 py-2.5 font-medium text-brand-fg hover:opacity-90"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-slate-300 px-5 py-2.5 font-medium hover:bg-white"
        >
          Log in
        </Link>
      </div>
    </main>
  );
}
