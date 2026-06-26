import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { AuthForm } from "@/components/AuthForm";

export default function CompanySignupPage() {
  return (
    <AuthShell
      title="Company signup"
      subtitle="Creates your tenant with IT Support and General Requests teams."
      footer={
        <Link href="/signup" className="font-medium text-brand">
          ← Back
        </Link>
      }
    >
      <AuthForm
        endpoint="/api/auth/signup/company"
        submitLabel="Create company"
        fields={[
          { name: "name", label: "Your name" },
          { name: "companyName", label: "Company name" },
          { name: "email", label: "Work email", type: "email" },
          { name: "password", label: "Password", type: "password", placeholder: "Min 8 characters" },
        ]}
      />
    </AuthShell>
  );
}
