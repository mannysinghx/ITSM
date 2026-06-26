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
      <Link href="/" className="text-sm font-semibold uppercase tracking-widest text-brand">
        FlowDesk ITSM
      </Link>
      <h1 className="mt-4 text-2xl font-bold">{title}</h1>
      {subtitle && <p className="mt-1 text-slate-600">{subtitle}</p>}
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        {children}
      </div>
      {footer && <div className="mt-4 text-sm text-slate-600">{footer}</div>}
    </main>
  );
}
