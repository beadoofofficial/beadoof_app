"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  );
}

function SignUpForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const valid =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    password.length >= 8 &&
    password === confirm;

  const submit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (busy || !valid) return;
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) {
        setError(error.message);
        return;
      }
      setSentTo(email.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-up failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf3ea] px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-6 md:p-8 space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold">Create your Beadoof account</h1>
          <p className="text-sm text-[#7a6a60] mt-1">
            Confirm your email to start ordering.
          </p>
        </div>

        {sentTo ? (
          <div className="text-center space-y-3">
            <div className="text-5xl">📧</div>
            <p className="text-sm text-[#3b2b22]">
              A confirmation link was sent to{" "}
              <strong className="break-all">{sentTo}</strong>. Click it to
              activate your account, then come back to sign in.
            </p>
            <Link
              href="/sign-in"
              className="inline-block bg-[#5a3a24] text-white px-5 py-2 rounded-full text-sm font-semibold"
            >
              Go to sign-in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <Field label="Email">
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full border border-[#e4d3c4] rounded-lg px-3 py-2"
              />
            </Field>

            <Field label="Password">
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full border border-[#e4d3c4] rounded-lg px-3 py-2"
              />
            </Field>

            <Field label="Confirm password">
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat the password"
                className={`w-full border rounded-lg px-3 py-2 ${
                  confirm && password !== confirm
                    ? "border-red-300"
                    : "border-[#e4d3c4]"
                }`}
              />
              {confirm && password !== confirm && (
                <span className="block text-[11px] text-red-600 mt-1">
                  Passwords don&apos;t match
                </span>
              )}
            </Field>

            {error && (
              <div className="text-xs text-red-700 bg-red-50 rounded-lg p-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !valid}
              className="w-full bg-[#5a3a24] text-white py-2.5 rounded-lg font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? "Creating…" : "Create account"}
            </button>
          </form>
        )}

        <div className="text-center pt-2 space-y-1">
          <div className="text-xs text-[#7a6a60]">
            Already have an account?{" "}
            <Link href="/sign-in" className="underline font-semibold">
              Sign in
            </Link>
          </div>
          <Link href="/" className="block text-xs text-[#7a6a60] underline">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide text-[#9a8478] mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
