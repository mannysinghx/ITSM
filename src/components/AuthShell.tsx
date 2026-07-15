import Link from "next/link";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-bold text-white">
          FD
        </span>
        <span className="text-sm font-semibold uppercase tracking-widest text-brand-700">
          FlowDesk ITSM
        </span>
      </Link>
      <h1 className="mt-6 text-2xl font-bold text-slate-900">{title}</h1>
      {subtitle && <p className="mt-1 text-slate-600">{subtitle}</p>}
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-card">
        {children}
      </div>
      {footer && <div className="mt-4 text-sm text-slate-600">{footer}</div>}
    </main>
  );
}
