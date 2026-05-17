"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setError(error.message);
        return;
      }
      // Hard navigation so the new auth cookie is picked up by every server
      // component on the destination page. Avoids the Next.js router-init
      // race that triggers "Router action dispatched before initialization."
      window.location.assign(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf3ea] px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-6 md:p-8 space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold">Sign in to Beadoof</h1>
          <p className="text-sm text-[#7a6a60] mt-1">Welcome back, Maker.</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wide text-[#9a8478] mb-1">
              Email
            </span>
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
          </label>

          <label className="block">
            <span className="block text-[11px] uppercase tracking-wide text-[#9a8478] mb-1">
              Password
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              className="w-full border border-[#e4d3c4] rounded-lg px-3 py-2"
            />
          </label>

          {error && (
            <div className="text-xs text-red-700 bg-red-50 rounded-lg p-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !email.trim() || !password}
            className="w-full bg-[#5a3a24] text-white py-2.5 rounded-lg font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="text-center pt-2 space-y-1">
          <div className="text-xs text-[#7a6a60]">
            New here?{" "}
            <Link
              href={`/sign-up?next=${encodeURIComponent(next)}`}
              className="underline font-semibold"
            >
              Create an account
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
