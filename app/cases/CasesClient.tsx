"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Briefcase, Search, ChevronRight, Archive, CheckCircle2, Clock3, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CreateCaseModal from "./CreateCaseModal";
import QuickAddDiscoveryModal from "./QuickAddDiscoveryModal";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:             "bg-green-100 text-green-700",
  DISCOVERY:          "bg-green-100 text-green-700",
  SERVED:             "bg-green-100 text-green-700",
  ARBITRATION:        "bg-blue-100 text-blue-700",
  UIM_ARBITRATION:    "bg-blue-100 text-blue-700",
  UM_ARBITRATION:     "bg-blue-100 text-blue-700",
  PENDING:            "bg-yellow-100 text-yellow-700",
  PENDING_SERVICE:    "bg-yellow-100 text-yellow-700",
  SENT_FOR_SERVICE:   "bg-yellow-100 text-yellow-700",
  PARTIALLY_SERVED:   "bg-yellow-100 text-yellow-700",
  SERVICE_POSTPONED:  "bg-yellow-100 text-yellow-700",
  PENDING_RFD:        "bg-yellow-100 text-yellow-700",
  SETTLED:            "bg-slate-100 text-slate-600",
  CLOSED:             "bg-slate-100 text-slate-600",
  DISBURSEMENT:       "bg-slate-100 text-slate-600",
  LIEN_NEGOTIATIONS:  "bg-slate-100 text-slate-600",
  DISMISSAL_FILED:    "bg-slate-100 text-slate-600",
  ARCHIVED:           "bg-slate-100 text-slate-400",
};

const STATUS_GROUPS: { label: string; statuses: string[] }[] = [
  { label: "Active", statuses: ["ACTIVE", "DISCOVERY", "SERVED"] },
  { label: "Arbitration", statuses: ["ARBITRATION", "UIM_ARBITRATION", "UM_ARBITRATION"] },
  { label: "Pending", statuses: ["PENDING", "PENDING_SERVICE", "SENT_FOR_SERVICE", "PARTIALLY_SERVED", "SERVICE_POSTPONED", "PENDING_RFD"] },
  { label: "Settled / Closed", statuses: ["SETTLED", "CLOSED", "DISBURSEMENT", "LIEN_NEGOTIATIONS", "DISMISSAL_FILED"] },
  { label: "Archived", statuses: ["ARCHIVED"] },
];

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
  status: string;
  caseType: string;
  court: string | null;
  county: string | null;
  judge: string | null;
  defendant: string | null;
  defenseFirm: string | null;
  defenseAttorney: string | null;
  filingDate: string | null;
  dateOfLoss: string | null;
  parties: { id: string; name: string; role: string }[];
  _count: { events: number };
  updatedAt: string;
}

const MISSING_FILTERS: { label: string; test: (c: Case) => boolean }[] = [
  { label: "Case Number", test: (c) => !c.caseNumber },
  { label: "Defendant", test: (c) => !c.defendant },
  { label: "County", test: (c) => !c.county },
  { label: "Court", test: (c) => !c.court },
  { label: "Defense Attorney", test: (c) => !c.defenseAttorney },
  { label: "Defense Firm", test: (c) => !c.defenseFirm },
  { label: "Filing Date", test: (c) => !c.filingDate },
  { label: "Date of Loss", test: (c) => !c.dateOfLoss },
];

export default function CasesClient() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [missingFilter, setMissingFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modalOpen, setModalOpen]             = useState(false);
  const [discoveryModalOpen, setDiscoveryModalOpen] = useState(false);

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

  useEffect(() => {
    void Promise.resolve().then(fetchCases);
  }, []);

  const activeMissingFilter = MISSING_FILTERS.find((f) => f.label === missingFilter);

  const filtered = cases.filter((c) => {
    if (search) {
      const q = search.toLowerCase();
      if (!c.title.toLowerCase().includes(q) &&
          !(c.caseNumber ?? "").toLowerCase().includes(q) &&
          !(c.court ?? "").toLowerCase().includes(q)) return false;
    }
    if (activeMissingFilter && !activeMissingFilter.test(c)) return false;
    if (statusFilter && c.status !== statusFilter) return false;
    return true;
  });

  const grouped = STATUS_GROUPS.map((group) => ({
    ...group,
    cases: filtered.filter((c) => group.statuses.includes(c.status)),
  }));

  const activeCount = grouped[0].cases.length + grouped[1].cases.length;
  const pendingCount = grouped[2].cases.length;
  const closedCount = grouped[3].cases.length + grouped[4].cases.length;

  const stats = [
    { label: "Active", value: activeCount, icon: CheckCircle2 },
    { label: "Pending", value: pendingCount, icon: Clock3 },
    { label: "Closed", value: closedCount, icon: Archive },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-4 py-4 md:px-8 md:py-5 border-b border-slate-200/80 bg-white/90 backdrop-blur shrink-0">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Cases</h1>
          <p className="text-sm text-slate-500 mt-0.5">{cases.length} total matters</p>
        </div>
        <div className="hidden flex-1 items-center justify-end gap-3 md:flex">
          {stats.map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex min-w-28 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <Icon className="size-4 text-slate-500" />
              <div>
                <div className="text-sm font-bold leading-none text-slate-950">{value}</div>
                <div className="mt-0.5 text-[11px] font-medium text-slate-500">{label}</div>
              </div>
            </div>
          ))}
        </div>
        <Button variant="outline" onClick={() => setDiscoveryModalOpen(true)} className="gap-2 hidden sm:inline-flex">
          <FileText className="w-4 h-4" />
          Add Discovery
        </Button>
        <Button onClick={() => setModalOpen(true)} className="gap-2 bg-teal-700 hover:bg-teal-800 text-white border-0">
          <Plus className="w-4 h-4" />
          New Case
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="px-4 py-3 md:px-8 md:py-4 shrink-0 border-b border-slate-200/80 bg-white/70">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search cases, numbers, courts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 rounded-lg border-slate-200 bg-white pl-9 shadow-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`h-10 rounded-lg border px-3 text-sm shadow-sm ${statusFilter ? "border-teal-300 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-600"}`}
          >
            <option value="">All statuses</option>
            {[...new Set(cases.map((c) => c.status))].sort().map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
          <select
            value={missingFilter}
            onChange={(e) => setMissingFilter(e.target.value)}
            className={`h-10 rounded-lg border px-3 text-sm shadow-sm ${missingFilter ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600"}`}
          >
            <option value="">No missing filter</option>
            {MISSING_FILTERS.map((f) => (
              <option key={f.label} value={f.label}>Missing {f.label}</option>
            ))}
          </select>
          {(statusFilter || missingFilter) && (
            <span className="text-xs text-slate-500">{filtered.length} case{filtered.length !== 1 ? "s" : ""}</span>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading cases…</div>
        ) : cases.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-72 gap-3 rounded-lg border border-dashed border-slate-300 bg-white/70 text-center">
            <div className="grid size-12 place-items-center rounded-lg bg-teal-50 text-teal-700">
              <Briefcase className="w-6 h-6" />
            </div>
            <div>
              <p className="font-semibold text-sm text-slate-950">No cases yet</p>
              <p className="text-xs text-muted-foreground mt-1">Create your first case to start tracking events and deadlines.</p>
            </div>
            <Button size="sm" onClick={() => setModalOpen(true)} className="mt-1 bg-teal-700 hover:bg-teal-800 text-white border-0">
              New Case
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {grouped.map((group) => {
              if (group.cases.length === 0) return null;
              return (
                <div key={group.label}>
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                    {group.label} · {group.cases.length}
                  </h2>
                  <div className="flex flex-col gap-2">
                    {group.cases.map((c) => (
                      <Link
                        key={c.id}
                        href={`/cases/${c.id}`}
                        className="flex items-center gap-4 px-4 py-3.5 rounded-lg border border-slate-200 bg-white shadow-sm hover:border-teal-200 hover:bg-teal-50/20 transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="font-semibold text-sm truncate text-slate-950">{c.title}</span>
                            {c.caseNumber && (
                              <span className="text-xs text-muted-foreground font-mono shrink-0">#{c.caseNumber}</span>
                            )}
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[c.status] ?? "bg-slate-100 text-slate-600"}`}>
                              {c.status.replace(/_/g, " ")}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs font-medium text-slate-500 flex-wrap">
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
      {discoveryModalOpen && (
        <QuickAddDiscoveryModal
          onClose={() => setDiscoveryModalOpen(false)}
          onCreated={() => setDiscoveryModalOpen(false)}
        />
      )}
    </div>
  );
}
