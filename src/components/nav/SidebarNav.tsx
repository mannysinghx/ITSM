"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

function isActive(pathname: string, href: string) {
  return href === "/app/dashboard" ? pathname === href : pathname.startsWith(href);
}

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="mt-6 space-y-0.5">
      {items.map((n) => {
        const active = isActive(pathname, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-white/10 text-white"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span className={active ? "text-brand-300" : "text-slate-400"}>{n.icon}</span>
            {n.label}
            {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-400" />}
          </Link>
        );
      })}
    </nav>
  );
}
