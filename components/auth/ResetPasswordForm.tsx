"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const inputClass =
  "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20";

// mode "request": ask for a reset email. mode "reset": choose a new password using the emailed token.
export default function ResetPasswordForm({ mode, token }: { mode: "request" | "reset"; token?: string }) {
  const isRequest = mode === "request";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(isRequest ? "/api/auth/forgot-password" : "/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isRequest ? { email } : { token, password }),
      });
      if (res.ok) {
        setDone(true);
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Something went wrong. Try again.");
      }
    } catch {
      setError("Network error. Try again.");
    }
    setBusy(false);
  }

  const title = isRequest ? "Reset your password" : "Choose a new password";

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-slate-50 px-6 py-12">
      <section className="w-full max-w-[420px] rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/litcal-logo.svg" alt="LitCal" width={58} height={58} className="mb-4 size-[58px] rounded-xl shadow-sm" priority />
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">{title}</h1>
          {!done && (
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {isRequest
                ? "Enter your email and we'll send you a link to set a new password."
                : "Pick a password with at least 10 characters."}
            </p>
          )}
        </div>

        {done ? (
          <div className="flex flex-col gap-4 text-center">
            <p className="text-sm leading-6 text-slate-700">
              {isRequest
                ? "If an account exists for that email, a reset link is on its way. It expires in 1 hour."
                : "Your password has been updated."}
            </p>
            <Link href="/sign-in" className="text-sm font-semibold text-teal-800 hover:text-teal-900">
              Back to sign in
            </Link>
          </div>
        ) : !isRequest && !token ? (
          <p className="text-center text-sm text-slate-700">
            This reset link is invalid.{" "}
            <Link href="/forgot-password" className="font-semibold text-teal-800 hover:text-teal-900">Request a new one</Link>
          </p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            {isRequest ? (
              <input className={inputClass} type="email" required placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            ) : (
              <input className={inputClass} type="password" required minLength={10} placeholder="New password (10+ characters)" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            )}
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="mt-1 h-12 w-full rounded-xl bg-teal-800 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900 disabled:opacity-60"
            >
              {busy ? "Please wait…" : isRequest ? "Send reset link" : "Set password"}
            </button>
            <Link href="/sign-in" className="mt-2 text-center text-sm text-slate-600 hover:text-slate-800">
              Back to sign in
            </Link>
          </form>
        )}
      </section>
    </main>
  );
}
