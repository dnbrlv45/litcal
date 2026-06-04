"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

type AuthMode = "sign-in" | "sign-up";

interface Props {
  mode: AuthMode;
}

export default function LitCalGoogleAuth({ mode }: Props) {
  const router = useRouter();
  const isSignIn = mode === "sign-in";

  const [email, setEmail] = useState("");
  const [checking, setChecking] = useState(false);
  const [accountExists, setAccountExists] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setChecking(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();

      if (!data.exists) {
        router.push(`/sign-up?email=${encodeURIComponent(trimmed)}`);
        return;
      }

      setAccountExists(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setChecking(false);
    }
  }

  if (!isSignIn) {
    return (
      <main className="flex min-h-screen flex-1 items-center justify-center bg-slate-50 px-6 py-12">
        <section className="w-full max-w-[420px] rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70">
          <div className="mb-8 flex flex-col items-center text-center">
            <Image src="/litcal-logo.svg" alt="LitCal" width={58} height={58} className="mb-4 size-[58px] rounded-xl shadow-sm" priority />
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">Create your LitCal account</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Sign up with Google to get started.</p>
          </div>
          <div className="flex flex-col gap-3">
            <Link
              href="/api/auth/google/sign-in"
              className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50"
            >
              <span className="grid size-5 place-items-center rounded-full border border-slate-200 bg-white text-[13px] font-bold text-slate-700">G</span>
              Continue with Google
            </Link>
          </div>
          <p className="mt-6 text-center text-sm text-slate-600">
            Already have an account?{" "}
            <Link href="/sign-in" className="font-semibold text-teal-800 hover:text-teal-900">
              Sign in
            </Link>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-slate-50 px-6 py-12">
      <section className="w-full max-w-[420px] rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/litcal-logo.svg" alt="LitCal" width={58} height={58} className="mb-4 size-[58px] rounded-xl shadow-sm" priority />
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Sign in to LitCal</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Enter your email to continue.</p>
        </div>

        {!accountExists ? (
          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={checking}
              className="h-11 w-full rounded-xl bg-slate-950 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {checking ? "Checking…" : "Continue"}
            </button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-center text-sm text-slate-600">
              We found an account for{" "}
              <span className="font-medium text-slate-900">{email}</span>.
            </p>
            <Link
              href="/api/auth/google/sign-in"
              className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50"
            >
              <span className="grid size-5 place-items-center rounded-full border border-slate-200 bg-white text-[13px] font-bold text-slate-700">G</span>
              Continue with Google
            </Link>
            <button
              type="button"
              onClick={() => { setAccountExists(false); setEmail(""); }}
              className="text-xs text-slate-400 hover:text-slate-600 underline"
            >
              Use a different email
            </button>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-slate-600">
          Need an account?{" "}
          <Link href="/sign-up" className="font-semibold text-teal-800 hover:text-teal-900">
            Create one
          </Link>
        </p>
      </section>
    </main>
  );
}
