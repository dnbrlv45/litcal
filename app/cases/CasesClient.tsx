"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Briefcase, Search, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CreateCaseModal from "./CreateCaseModal";

const STATUS_COLORS = {
  ACTIVE:   "bg-green-100 text-green-700",
  PENDING:  "bg-yellow-100 text-yellow-700",
  CLOSED:   "bg-slate-100 text-slate-600",
  ARCHIVED: "bg-slate-100 text-slate-400",
};

const TYPE_LABELS: Record<string, string> = {
  AUTO_ACCIDENT: "Auto Accident", SLIP_AND_FALL: "Slip & Fall",
  GOVERNMENT_CLAIM: "Government Claim", DOG_BITE: "Dog Bite",
  PREMISES_LIABILITY: "Premises Liability", MEDICAL_MALPRACTICE: "Medical Malpractice",
  WRONGFUL_DEATH: "Wrongful Death", PRODUCT_LIABILITY: "Product Liability",
  OTHER: "Other",
};

interface Case {
  id: string;
  title: string;
  caseNumber: string | null;
  status: keyof typeof STATUS_COLORS;
  caseType: string;
  court: string | null;
  judge: string | null;
  _count: { events: number };
  updatedAt: string;
}

export default function CasesClient() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  async function fetchCases() {
    setLoading(true);
    try {
      const res = await fetch("/api/cases");
      const data = await res.json();
      setCases(data.cases ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchCases(); }, []);

  const filtered = cases.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    (c.caseNumber ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.court ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const grouped = {
    ACTIVE:   filtered.filter((c) => c.status === "ACTIVE"),
    PENDING:  filtered.filter((c) => c.status === "PENDING"),
    CLOSED:   filtered.filter((c) => c.status === "CLOSED"),
    ARCHIVED: filtered.filter((c) => c.status === "ARCHIVED"),
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-border shrink-0">
        <div>
          <h1 className="text-xl font-semibold">Cases</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{cases.length} total</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="gap-2 bg-teal-700 hover:bg-teal-800 text-white border-0">
          <Plus className="w-4 h-4" />
          New Case
        </Button>
      </div>

      {/* Search */}
      <div className="px-8 py-4 shrink-0 border-b border-border">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search cases, numbers, courts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading…</div>
        ) : cases.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 gap-3 text-center">
            <Briefcase className="w-10 h-10 text-muted-foreground/40" />
            <div>
              <p className="font-medium text-sm">No cases yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">Create your first case to start tracking events and deadlines.</p>
            </div>
            <Button size="sm" onClick={() => setModalOpen(true)} className="mt-1 bg-teal-700 hover:bg-teal-800 text-white border-0">
              New Case
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {(["ACTIVE", "PENDING", "CLOSED", "ARCHIVED"] as const).map((status) => {
              const group = grouped[status];
              if (group.length === 0) return null;
              return (
                <div key={status}>
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                    {status} · {group.length}
                  </h2>
                  <div className="flex flex-col gap-2">
                    {group.map((c) => (
                      <Link
                        key={c.id}
                        href={`/cases/${c.id}`}
                        className="flex items-center gap-4 px-4 py-3.5 rounded-xl border border-border bg-card hover:bg-accent/30 transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="font-semibold text-sm truncate">{c.title}</span>
                            {c.caseNumber && (
                              <span className="text-xs text-muted-foreground font-mono shrink-0">#{c.caseNumber}</span>
                            )}
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[c.status]}`}>
                              {c.status.charAt(0) + c.status.slice(1).toLowerCase()}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                            <span>{TYPE_LABELS[c.caseType]}</span>
                            {c.court && <span>· {c.court}</span>}
                            {c.judge && <span>· {c.judge}</span>}
                            <span>· {c._count.events} event{c._count.events !== 1 ? "s" : ""}</span>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CreateCaseModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={fetchCases} />
    </div>
  );
}
