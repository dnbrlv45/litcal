"use client";

import Image from "next/image";

export default function SetupClient() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center gap-8 text-center px-4 bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <Image src="/litcal-logo.svg" alt="LitCal" width={48} height={48} className="size-12 rounded-xl shadow-sm" priority />
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">No workspace access</h1>
          <p className="text-sm text-slate-500 max-w-sm">
            Your account isn&apos;t part of a workspace yet. Ask your administrator to invite you.
          </p>
        </div>
      </div>

      <form action="/api/auth/sign-out" method="post">
        <button className="text-xs text-slate-400 hover:text-slate-600 underline">
          Sign out
        </button>
      </form>
    </div>
  );
}
