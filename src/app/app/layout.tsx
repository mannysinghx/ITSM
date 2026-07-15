import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/authz";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { SidebarNav, type NavItem } from "@/components/nav/SidebarNav";
import {
  AdminIcon,
  ApprovalIcon,
  CatalogIcon,
  DashboardIcon,
  KnowledgeIcon,
  SecurityIcon,
  TaskIcon,
  TicketIcon,
} from "@/components/nav/icons";

const NAV: NavItem[] = [
  { href: "/app/dashboard", label: "Dashboard", icon: <DashboardIcon /> },
  { href: "/app/tickets", label: "Tickets", icon: <TicketIcon /> },
  { href: "/app/tasks", label: "Tasks", icon: <TaskIcon /> },
  { href: "/app/service-catalog", label: "Service Catalog", icon: <CatalogIcon /> },
  { href: "/app/approvals", label: "Approvals", icon: <ApprovalIcon /> },
  { href: "/app/knowledge", label: "Knowledge", icon: <KnowledgeIcon /> },
  { href: "/app/settings/security", label: "Security", icon: <SecurityIcon /> },
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
  const navItems = isAdmin
    ? [...NAV, { href: "/app/admin", label: "Admin", icon: <AdminIcon /> }]
    : NAV;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-60 shrink-0 flex-col bg-slate-900 p-4">
        <div className="flex items-center gap-2 px-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-bold text-white">
            FD
          </span>
          <span className="text-sm font-semibold tracking-wide text-white">FlowDesk</span>
        </div>
        <div className="mt-1 truncate px-2 text-xs text-slate-400">{tenant?.name}</div>
        <SidebarNav items={navItems} />
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-card">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-600/20">
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
