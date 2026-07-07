import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export default function LegalPageShell({
  title,
  effectiveDate,
  children,
}: {
  title: string;
  effectiveDate: string;
  children: ReactNode;
}) {
  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link href="/" className="mb-8 flex items-center gap-2.5 text-sm font-semibold text-slate-700 hover:text-slate-950">
          <Image src="/litcal-logo.svg" alt="LitCal" width={28} height={28} className="size-7 rounded-md shadow-sm" />
          LitCal
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">Effective {effectiveDate}</p>
        <div className="mt-8 space-y-6">{children}</div>
      </div>
    </div>
  );
}

export function LegalH2({ children }: { children: ReactNode }) {
  return <h2 className="text-base font-bold text-slate-950">{children}</h2>;
}

export function LegalP({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-sm leading-6 text-slate-600">{children}</p>;
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-slate-600">{children}</ul>;
}
