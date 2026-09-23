"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { FaEye, FaEyeSlash } from "react-icons/fa6";

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
  const [showPassword, setShowPassword] = useState(false);

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
        setBusy(false); // wrong password: the button goes back to "Sign in"
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
    <div className="min-h-screen flex items-center justify-center bg-paper px-4 font-shop text-ink">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-6 md:p-8 space-y-4">
        <div className="text-center">
          <h1 className="font-display text-2xl font-semibold">Sign in to Beadoof</h1>
          <p className="text-sm text-shop-muted mt-1">Welcome back, Maker.</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wide text-shop-muted mb-1">
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
              className="w-full rounded-xl border-2 border-cord/50 px-3 py-2 focus:border-aqua focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="block text-[11px] uppercase tracking-wide text-shop-muted mb-1">
              Password
            </span>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                className="w-full rounded-xl border-2 border-cord/50 py-2 pl-3 pr-10 focus:border-aqua focus:outline-none"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center text-shop-muted hover:text-ink"
              >
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </label>

          {error && (
            <div className="text-xs text-red-700 bg-red-50 rounded-lg p-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !email.trim() || !password}
            className="w-full cursor-pointer rounded-full bg-shop-pink py-2.5 font-display font-medium text-white shadow-[0_3px_0_#c93a74] active:translate-y-[2px] active:shadow-[0_1px_0_#c93a74] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="text-center pt-2">
          <Link href="/" className="block text-xs text-shop-muted underline">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
