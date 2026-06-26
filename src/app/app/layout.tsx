import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/authz";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";

const NAV = [
  { href: "/app/dashboard", label: "Dashboard" },
  { href: "/app/tickets", label: "Tickets" },
  { href: "/app/tasks", label: "Tasks" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const tenant = await withTenant(ctx.tenantId, ctx.userId, (tx) =>
    tx.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { name: true, type: true },
    }),
  );

  const isAdmin = hasPermission(ctx, "admin.view") || hasPermission(ctx, "admin.configure");

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white p-4">
        <div className="px-2 text-sm font-semibold uppercase tracking-widest text-brand">
          FlowDesk
        </div>
        <div className="mt-1 px-2 text-sm text-slate-500">{tenant?.name}</div>
        <nav className="mt-6 space-y-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="block rounded-md px-2 py-1.5 text-sm hover:bg-slate-100"
            >
              {n.label}
            </Link>
          ))}
          {isAdmin && (
            <Link
              href="/app/admin"
              className="block rounded-md px-2 py-1.5 text-sm hover:bg-slate-100"
            >
              Admin
            </Link>
          )}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <span className="text-sm text-slate-500">
            {tenant?.type === "company" ? "Company workspace" : "Personal workspace"}
          </span>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <LogoutButton />
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
