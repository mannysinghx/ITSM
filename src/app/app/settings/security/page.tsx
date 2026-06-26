"use client";

import { useState } from "react";

interface Enrollment {
  secret: string;
  otpauthUrl: string;
}

export default function SecurityPage() {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [disableBusy, setDisableBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [verifyCode, setVerifyCode] = useState("");
  const [disableCode, setDisableCode] = useState("");

  async function enroll() {
    setEnrollBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/enroll", { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Enroll failed");
      const data = await res.json();
      setEnrollment({ secret: data.secret, otpauthUrl: data.otpauthUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enroll failed");
    } finally {
      setEnrollBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setVerifyBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verifyCode }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Verification failed");
      const data = await res.json();
      setRecoveryCodes(data.recoveryCodes ?? []);
      setEnrollment(null);
      setVerifyCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setVerifyBusy(false);
    }
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    setDisableBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: disableCode }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Disable failed");
      setDisableCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disable failed");
    } finally {
      setDisableBusy(false);
    }
  }

  function reset() {
    setEnrollment(null);
    setRecoveryCodes(null);
    setVerifyCode("");
    setError(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Security</h1>
        <p className="mt-1 text-sm text-slate-500">
          Two-factor uses time-based one-time passwords (TOTP).
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {recoveryCodes ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-amber-900">Recovery codes</h2>
          <p className="text-sm text-amber-800">
            Save these recovery codes somewhere safe — each can be used once if you lose
            your device. They will not be shown again.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {recoveryCodes.map((c) => (
              <code
                key={c}
                className="rounded border border-amber-300 bg-white px-2 py-1 text-center text-sm font-mono text-slate-800"
              >
                {c}
              </code>
            ))}
          </div>
          <button
            onClick={reset}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:opacity-90"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <h2 className="text-sm font-semibold">Two-factor authentication</h2>
          {!enrollment ? (
            <button
              onClick={enroll}
              disabled={enrollBusy}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
            >
              {enrollBusy ? "Please wait…" : "Enable two-factor authentication"}
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Add this to your authenticator app (Google Authenticator, Authy,
                1Password), then enter the 6-digit code below.
              </p>
              <div>
                <label className="mb-1 block text-sm text-slate-600">
                  Authenticator URL
                </label>
                <a
                  href={enrollment.otpauthUrl}
                  className="block break-all rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-brand hover:underline"
                >
                  {enrollment.otpauthUrl}
                </a>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">Secret</label>
                <code className="block break-all rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono text-slate-800">
                  {enrollment.secret}
                </code>
              </div>
              <form onSubmit={verify} className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="mb-1 block text-sm text-slate-600">
                    6-digit code
                  </label>
                  <input
                    required
                    inputMode="numeric"
                    placeholder="123456"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={verifyBusy}
                  className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
                >
                  {verifyBusy ? "Verifying…" : "Verify & enable"}
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold">Disable MFA</h2>
        <p className="text-sm text-slate-600">
          Enter a current 6-digit code to turn off two-factor authentication.
        </p>
        <form onSubmit={disable} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-sm text-slate-600">6-digit code</label>
            <input
              required
              inputMode="numeric"
              placeholder="123456"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={disableBusy}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            {disableBusy ? "Disabling…" : "Disable"}
          </button>
        </form>
      </div>
    </div>
  );
}
