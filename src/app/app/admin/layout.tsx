import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/authz";

const ADMIN_NAV = [
  { href: "/app/admin", label: "Overview" },
  { href: "/app/admin/users", label: "Users" },
  { href: "/app/admin/teams", label: "Teams" },
  { href: "/app/admin/roles", label: "Roles & Permissions" },
  { href: "/app/admin/ticket-config", label: "Ticket Configuration" },
  { href: "/app/admin/service-catalog", label: "Service Catalog" },
  { href: "/app/admin/forms", label: "Forms" },
  { href: "/app/admin/slas", label: "SLAs" },
  { href: "/app/admin/ai", label: "AI Settings" },
  { href: "/app/admin/automation", label: "Automation" },
  { href: "/app/admin/integrations", label: "Integrations" },
  { href: "/app/admin/api-keys", label: "API Keys" },
  { href: "/app/admin/billing", label: "Billing" },
  { href: "/app/admin/audit-logs", label: "Audit Logs" },
];

/** Gates the entire /app/admin subtree on an admin-tier permission (ADR-3). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!hasPermission(ctx, "admin.view")) redirect("/app/dashboard");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-sm text-slate-500">Tenant configuration — every change is audited.</p>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {ADMIN_NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className="rounded-t-md px-3 py-2 text-sm text-slate-600 hover:bg-white hover:text-slate-900"
          >
            {n.label}
          </Link>
        ))}
      </div>
      <div>{children}</div>
    </div>
  );
}
