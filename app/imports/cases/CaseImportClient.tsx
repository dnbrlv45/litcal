"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ImportCase = {
  importKey: string;
  title: string;
  plaintiffs: string[];
  defendants: string | null;
  caseNumber: string | null;
  county: string | null;
  court: string | null;
  defenseAttorney: string | null;
  defenseFirm: string | null;
  filingDate: string | null;
  dateOfLoss: string | null;
  status: "ACTIVE" | "PENDING" | "CLOSED" | "ARCHIVED";
  sourceRows: number[];
  warnings: string[];
  duplicateCaseId: string | null;
};

type PreviewResult = {
  rowsFound: number;
  casesFound: number;
  mergedPlaintiffRows: number;
  cases: ImportCase[];
};

type CommitResult = {
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  failed: { title: string; error: string }[];
};

const STATUS_STYLES: Record<ImportCase["status"], string> = {
  ACTIVE: "bg-green-100 text-green-700",
  PENDING: "bg-yellow-100 text-yellow-700",
  CLOSED: "bg-slate-100 text-slate-700",
  ARCHIVED: "bg-slate-100 text-slate-500",
};

export default function CaseImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);

  const selectedCases = useMemo(
    () => preview?.cases.filter((item) => selectedKeys.has(item.importKey)) ?? [],
    [preview, selectedKeys],
  );
  const duplicateCount = preview?.cases.filter((item) => item.duplicateCaseId).length ?? 0;
  const warningCount = preview?.cases.filter((item) => item.warnings.length > 0).length ?? 0;

  async function handlePreview() {
    if (!file) {
      setError("Choose an Excel or CSV file first.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/imports/cases/preview", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not preview import.");
      setPreview(data);
      setSelectedKeys(new Set((data.cases as ImportCase[]).filter((item) => !item.duplicateCaseId && item.warnings.length === 0).map((item) => item.importKey)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not preview import.");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (selectedCases.length === 0) {
      setError("Select at least one case to import.");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/imports/cases/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cases: selectedCases, skipDuplicates: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed.");
      setResult(data);
      setSelectedKeys(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  function toggleCase(key: string) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectReady() {
    if (!preview) return;
    setSelectedKeys(new Set(preview.cases.filter((item) => !item.duplicateCaseId && item.warnings.length === 0).map((item) => item.importKey)));
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-5 md:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">Import Cases</h1>
            <p className="mt-1 text-sm text-slate-500">Upload a spreadsheet, review grouped cases, then approve the import.</p>
          </div>
          <Link
            href="/cases"
            className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Back to Cases
          </Link>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 md:px-8">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <label htmlFor="case-import-file" className="text-sm font-semibold text-slate-950">Spreadsheet</label>
              <div className="mt-2 flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center md:flex-row md:justify-start md:text-left">
                <FileSpreadsheet className="size-8 text-teal-700" />
                <div className="min-w-0">
                  <input
                    id="case-import-file"
                    type="file"
                    accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                    onChange={(event) => {
                      setFile(event.target.files?.[0] ?? null);
                      setPreview(null);
                      setResult(null);
                      setError(null);
                    }}
                    className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-700 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
                  />
                  <p className="mt-1 text-xs text-slate-500">Supported columns: Plaintiff/Case, Defendant(s), Case Number, County, Court/Courthouse, Defense Attorney/Counsel, Defense Firm, Date Filed, Served Date, Status, Date of Loss/DOI, Case Type, ATTY.</p>
                </div>
              </div>
            </div>
            <Button type="button" onClick={handlePreview} disabled={!file || loading} className="bg-teal-700 text-white hover:bg-teal-800">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Preview Import
            </Button>
          </div>
          {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
        </section>

        {preview && (
          <>
            <section className="grid gap-3 md:grid-cols-5">
              <Metric label="Rows found" value={preview.rowsFound} />
              <Metric label="Unique cases" value={preview.casesFound} />
              <Metric label="Merged plaintiffs" value={preview.mergedPlaintiffRows} />
              <Metric label="Duplicates" value={duplicateCount} />
              <Metric label="Needs review" value={warningCount} />
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-950">{selectedCases.length} selected for import</h2>
                  <p className="text-xs text-slate-500">Duplicate and warning rows are left unselected by default.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={selectReady}>Select Ready</Button>
                  <Button variant="outline" onClick={() => setSelectedKeys(new Set(preview.cases.map((item) => item.importKey)))}>Select All</Button>
                  <Button variant="outline" onClick={() => setSelectedKeys(new Set())}>Clear</Button>
                  <Button onClick={handleImport} disabled={importing || selectedCases.length === 0} className="bg-teal-700 text-white hover:bg-teal-800">
                    {importing ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                    Create Cases
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-12 px-4 py-3">Use</th>
                      <th className="px-4 py-3">Case</th>
                      <th className="px-4 py-3">Plaintiffs</th>
                      <th className="px-4 py-3">Venue</th>
                      <th className="px-4 py-3">Defense</th>
                      <th className="px-4 py-3">Dates</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.cases.map((item) => (
                      <tr key={item.importKey} className={item.duplicateCaseId || item.warnings.length ? "bg-amber-50/40" : "bg-white"}>
                        <td className="px-4 py-3 align-top">
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(item.importKey)}
                            onChange={() => toggleCase(item.importKey)}
                            className="size-4 rounded border-slate-300"
                            aria-label={`Import ${item.title}`}
                          />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="font-semibold text-slate-950">{item.title}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.caseNumber ? `#${item.caseNumber}` : "No case number"} · rows {item.sourceRows.join(", ")}</div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {item.duplicateCaseId && <Badge className="bg-red-100 text-red-700">Possible duplicate</Badge>}
                            {item.warnings.map((warning) => <Badge key={warning} className="bg-amber-100 text-amber-800">{warning}</Badge>)}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-700">
                          <div className="font-medium">{item.plaintiffs.length}</div>
                          <div className="mt-1 max-w-56 text-xs leading-5 text-slate-500">{item.plaintiffs.join("; ")}</div>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-700">
                          <div>{item.county || "No county"}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.court || "No court"}</div>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-700">
                          <div>{item.defenseAttorney || "No attorney"}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.defenseFirm || "No firm"}</div>
                          {item.defendants && <div className="mt-1 text-xs text-slate-500">{item.defendants}</div>}
                        </td>
                        <td className="px-4 py-3 align-top text-slate-700">
                          <div>Filed: {item.filingDate || "Not set"}</div>
                          <div className="mt-1 text-xs text-slate-500">Loss: {item.dateOfLoss || "Not set"}</div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${STATUS_STYLES[item.status]}`}>{item.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {result && (
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              {result.failedCount ? <AlertTriangle className="size-5 text-amber-600" /> : <CheckCircle2 className="size-5 text-green-600" />}
              <h2 className="text-sm font-semibold text-slate-950">Import complete</h2>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Created {result.createdCount} case{result.createdCount === 1 ? "" : "s"}, skipped {result.skippedCount} duplicate{result.skippedCount === 1 ? "" : "s"}, failed {result.failedCount}.
            </p>
            {result.failed.length > 0 && (
              <div className="mt-3 space-y-2">
                {result.failed.map((item) => (
                  <div key={`${item.title}-${item.error}`} className="flex gap-2 text-sm text-red-700">
                    <XCircle className="mt-0.5 size-4 shrink-0" />
                    <span>{item.title}: {item.error}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-2xl font-bold text-slate-950">{value}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
