import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { AuthForm } from "@/components/AuthForm";

export default function IndividualSignupPage() {
  return (
    <AuthShell
      title="Individual signup"
      subtitle="Your Personal Workspace is created instantly."
      footer={
        <Link href="/signup" className="font-medium text-brand">
          ← Back
        </Link>
      }
    >
      <AuthForm
        endpoint="/api/auth/signup/individual"
        submitLabel="Create workspace"
        fields={[
          { name: "name", label: "Your name" },
          { name: "email", label: "Email", type: "email" },
          { name: "password", label: "Password", type: "password", placeholder: "Min 8 characters" },
        ]}
      />
    </AuthShell>
  );
}
