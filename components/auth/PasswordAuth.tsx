"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

type AuthMode = "sign-in" | "sign-up";

const inputClass =
  "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20";

export default function PasswordAuth({ mode }: { mode: AuthMode }) {
  const isSignIn = mode === "sign-in";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(isSignIn ? "/api/auth/sign-in" : "/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, firstName, lastName }),
      });
      if (res.ok) {
        window.location.href = "/";
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Something went wrong. Try again.");
    } catch {
      setError("Network error. Try again.");
    }
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-slate-50 px-6 py-12">
      <section className="w-full max-w-[420px] rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/litcal-logo.svg" alt="LitCal" width={58} height={58} className="mb-4 size-[58px] rounded-xl shadow-sm" priority />
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            {isSignIn ? "Sign in to LitCal" : "Create a workspace"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {isSignIn
              ? "Enter your email and password to access your litigation calendar."
              : "Create your account to set up your workspace."}
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {!isSignIn && (
            <div className="flex gap-3">
              <input className={inputClass} placeholder="First name" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              <input className={inputClass} placeholder="Last name" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          )}
          <input className={inputClass} type="email" required placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input
            className={inputClass}
            type="password"
            required
            minLength={isSignIn ? undefined : 10}
            placeholder={isSignIn ? "Password" : "Password (10+ characters)"}
            autoComplete={isSignIn ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="mt-1 h-12 w-full rounded-xl bg-teal-800 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900 disabled:opacity-60"
          >
            {busy ? "Please wait…" : isSignIn ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          {isSignIn ? (
            <>
              New to LitCal?{" "}
              <Link href="/sign-up" className="font-semibold text-teal-800 hover:text-teal-900">Create a workspace</Link>
            </>
          ) : (
            <>
              Already have a workspace?{" "}
              <Link href="/sign-in" className="font-semibold text-teal-800 hover:text-teal-900">Sign in</Link>
            </>
          )}
        </p>

        <p className="mt-6 text-center text-xs leading-5 text-slate-500">
          By continuing, you agree to LitCal&rsquo;s{" "}
          <Link href="/terms" className="underline hover:text-slate-700">Terms of Service</Link> and{" "}
          <Link href="/privacy" className="underline hover:text-slate-700">Privacy Policy</Link>.
        </p>
      </section>
    </main>
  );
}
