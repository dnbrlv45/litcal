"use client";

import Image from "next/image";
import Link from "next/link";

type AuthMode = "sign-in" | "sign-up";

interface Props {
  mode: AuthMode;
}

export default function LitCalGoogleAuth({ mode }: Props) {
  const isSignIn = mode === "sign-in";
  const title = isSignIn ? "Sign in to LitCal" : "Create your LitCal account";
  const subtitle = isSignIn
    ? "Use your Google account to access your litigation calendar."
    : "Sign up with Google to get started.";
  const alternateHref = isSignIn ? "/sign-up" : "/sign-in";
  const alternateText = isSignIn ? "Need an account?" : "Already have an account?";
  const alternateAction = isSignIn ? "Create one" : "Sign in";

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-slate-50 px-6 py-12">
      <section className="w-full max-w-[420px] rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/litcal-logo.svg" alt="LitCal" width={58} height={58} className="mb-4 size-[58px] rounded-xl shadow-sm" priority />
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>
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
          {alternateText}{" "}
          <Link href={alternateHref} className="font-semibold text-teal-800 hover:text-teal-900">
            {alternateAction}
          </Link>
        </p>

        <p className="mt-6 text-center text-xs leading-5 text-slate-500">
          By continuing, you agree to use LitCal for authorized legal calendar management.
        </p>
      </section>
    </main>
  );
}
