"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, CheckCircle, AlertCircle } from "lucide-react";

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    // Handle quoted fields with commas inside
    const values: string[] = [];
    let cur = "";
    let inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === "," && !inQuote) { values.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    values.push(cur.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

export default function CourtRulesPage() {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setResult(null); setError(null);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) { setError("No rows found in CSV."); return; }
      const res = await fetch("/api/court-hearing-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      if (!res.ok) { setError("Import failed. Check the file format and try again."); return; }
      setResult(await res.json());
    } catch {
      setError("Could not read the file.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="max-w-xl mx-auto py-10 px-4 flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Court Hearing Rules</h1>
        <p className="mt-1 text-sm text-slate-500">
          Import remote appearance rules from the Court Hearings CSV. Running the import
          multiple times is safe — existing rows are updated, new rows are created.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-slate-800">Upload CSV</p>
          <p className="text-xs text-slate-500">
            Expected columns: county, court_name, department, appearance_type, phone_number,
            bridge, password, remote_link, request_required_bool
          </p>
        </div>

        <label className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-10 cursor-pointer hover:border-teal-400 hover:bg-teal-50/30 transition-colors">
          <Upload className="w-8 h-8 text-slate-400" />
          <span className="text-sm text-slate-600">
            {importing ? "Importing…" : "Click to select a CSV file"}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={handleFile}
            disabled={importing}
          />
        </label>

        {result && (
          <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm">
            <CheckCircle className="w-4 h-4 shrink-0 text-green-600 mt-0.5" />
            <div className="flex flex-col gap-0.5 text-green-800">
              <p className="font-semibold">Import complete</p>
              <p>{result.created} created · {result.updated} updated · {result.skipped} skipped</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
            <p className="text-rose-800">{error}</p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col gap-3">
        <p className="text-sm font-semibold text-slate-800">Matching priority</p>
        <ol className="list-decimal list-inside flex flex-col gap-1.5 text-sm text-slate-600">
          <li>County + courthouse + department</li>
          <li>County + courthouse (all departments)</li>
          <li>County-wide rule</li>
          <li>No match — manual entry allowed, no rule applied</li>
        </ol>
      </div>
    </div>
  );
}
