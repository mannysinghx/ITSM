import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { AuthForm } from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <AuthShell
      title="Log in"
      subtitle="Welcome back to FlowDesk."
      footer={
        <>
          No account?{" "}
          <Link href="/signup" className="font-medium text-brand">
            Sign up
          </Link>
        </>
      }
    >
      <AuthForm
        endpoint="/api/auth/login"
        submitLabel="Log in"
        fields={[
          { name: "email", label: "Email", type: "email" },
          { name: "password", label: "Password", type: "password" },
        ]}
      />
    </AuthShell>
  );
}
