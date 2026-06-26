import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";

export default function SignupChoicePage() {
  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Choose how you want to use FlowDesk."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand">
            Log in
          </Link>
        </>
      }
    >
      <div className="space-y-3">
        <Link
          href="/signup/individual"
          className="block rounded-md border border-slate-200 p-4 hover:border-brand"
        >
          <div className="font-medium">Individual</div>
          <div className="text-sm text-slate-600">
            A personal ITSM workspace, ready immediately.
          </div>
        </Link>
        <Link
          href="/signup/company"
          className="block rounded-md border border-slate-200 p-4 hover:border-brand"
        >
          <div className="font-medium">Company</div>
          <div className="text-sm text-slate-600">
            Create an organization with teams, users, and roles.
          </div>
        </Link>
      </div>
    </AuthShell>
  );
}
