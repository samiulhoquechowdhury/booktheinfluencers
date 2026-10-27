"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, FileSpreadsheet, LoaderCircle, Upload, XCircle } from "lucide-react";
import { IMPORT_COLUMNS, IMPORT_EXAMPLE_ROW, IMPORT_MAX_ROWS, type ImportResult } from "@repo/schemas";
import { toCsv } from "@repo/utils";
import { api, can, errorMessage } from "@/lib/api";
import { useStaffMutation, useStaffSession } from "@/lib/hooks";
import { Card, Failure, Loading, PageHeader, Pill, inputClass } from "@/components/ui";

// Bulk talent import: download the template, fill it in a spreadsheet, check, then import the valid rows as drafts.

function downloadTemplate() {
  const csv = toCsv([IMPORT_COLUMNS.map((c) => c.key), IMPORT_COLUMNS.map((c) => IMPORT_EXAMPLE_ROW[c.key])]);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "talent-import-template.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportTalentsPage() {
  const { data: staff } = useStaffSession();
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [checked, setChecked] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const check = useStaffMutation((text: string) => api.talents.importCsv(text, false));
  const commit = useStaffMutation((text: string) => api.talents.importCsv(text, true), "Import complete");

  if (!staff) return <Loading />;
  if (!can(staff, "TALENT_MANAGER")) return <Failure message="Only talent managers can import artists" />;

  const run = (text: string) => {
    setError("");
    setDone(null);
    check.mutate(text, { onSuccess: setChecked, onError: (e) => { setChecked(null); setError(errorMessage(e)); } });
  };

  async function choose(f: File | undefined) {
    if (!f) return;
    if (f.size > 1_000_000) return setError("Keep the file under 1 MB (about 500 artists)");
    const text = await f.text();
    setFileName(f.name);
    setCsv(text);
    run(text);
  }

  const bad = checked?.rows.filter((r) => r.errors.length) ?? [];

  return (
    <div className="space-y-5">
      <Link href="/talents" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        Talents
      </Link>
      <PageHeader
        title="Import artists"
        description={`Add up to ${IMPORT_MAX_ROWS} artists from a spreadsheet. Each becomes a draft profile — check it, verify the representative, then publish.`}
        actions={
          <button type="button" onClick={downloadTemplate} className="btn btn-outline btn-sm">
            <Download aria-hidden />
            Download template
          </button>
        }
      />

      {done ? (
        <Card>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-emerald-600" aria-hidden />
            <div>
              <h2 className="text-lg font-semibold text-ink">{done.created} draft {done.created === 1 ? "profile" : "profiles"} created</h2>
              <p className="text-sm text-muted">Representatives were added as KYC pending. Verify them on each profile before publishing.</p>
            </div>
          </div>
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
            {done.rows.filter((r) => r.slug).map((r) => (
              <li key={r.line} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="font-medium text-ink">{r.stageName}</span>
                <Link href={`/talents/${r.slug}`} className="text-gold-deep hover:underline">Open profile</Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/talents" className="btn btn-dark btn-sm">Back to talents</Link>
            <button type="button" onClick={() => { setDone(null); setChecked(null); setCsv(""); setFileName(null); }} className="btn btn-outline btn-sm">Import another file</button>
          </div>
        </Card>
      ) : (
        <>
          <Card title="1. Choose your file">
            <div className="flex flex-wrap items-center gap-3">
              <input ref={file} id="csv-file" type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void choose(e.target.files?.[0]).finally(() => { if (file.current) file.current.value = ""; })} />
              <label htmlFor="csv-file" className="btn btn-dark btn-sm">
                <Upload aria-hidden />
                Choose CSV file
              </label>
              {fileName && (
                <span className="flex items-center gap-1.5 text-sm text-ink-soft">
                  <FileSpreadsheet className="size-4 text-gold-deep" aria-hidden />
                  {fileName}
                </span>
              )}
              <span className="text-xs text-muted">In Excel or Google Sheets: File → Save as / Download → CSV.</span>
            </div>
            <details className="mt-4">
              <summary className="text-sm font-medium text-gold-deep">Or paste the CSV text</summary>
              <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} placeholder={IMPORT_COLUMNS.map((c) => c.key).join(",")} className={`${inputClass} mt-2 font-mono text-xs`} />
              <button type="button" disabled={!csv.trim() || check.isPending} onClick={() => { setFileName(null); run(csv); }} className="btn btn-outline btn-sm mt-2 disabled:opacity-50">
                Check rows
              </button>
            </details>
            {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
          </Card>

          {check.isPending && <Loading label="Checking rows" />}

          {checked && !check.isPending && (
            <Card
              title="2. Check the rows"
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="success">{checked.valid} ready</Pill>
                  {bad.length > 0 && <Pill tone="danger">{bad.length} with problems</Pill>}
                </div>
              }
            >
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                    <tr>{["Line", "Artist", "Status"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {checked.rows.map((r) => (
                      <tr key={r.line} className={`border-b border-line align-top last:border-0 ${r.errors.length ? "bg-rose-50/40" : ""}`}>
                        <td className="px-4 py-2.5 text-muted">{r.line}</td>
                        <td className="px-4 py-2.5 font-medium text-ink">{r.stageName || <span className="text-muted">(no name)</span>}</td>
                        <td className="px-4 py-2.5">
                          {r.errors.length === 0 ? (
                            <span className="flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="size-4" aria-hidden />Ready</span>
                          ) : (
                            <ul className="space-y-1 text-rose-800">
                              {r.errors.map((e) => (
                                <li key={e} className="flex gap-1.5"><XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{e}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={checked.valid === 0 || commit.isPending}
                  onClick={() => commit.mutate(csv, { onSuccess: setDone, onError: (e) => setError(errorMessage(e)) })}
                  className="btn btn-gold btn-sm disabled:opacity-50"
                >
                  {commit.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
                  Import {checked.valid} {checked.valid === 1 ? "artist" : "artists"} as drafts
                </button>
                {bad.length > 0 && <span className="text-xs text-muted">Rows with problems are skipped. Fix them in the spreadsheet and import those later.</span>}
              </div>
            </Card>
          )}

          <Card title="Columns">
            <p className="mb-3 text-sm text-muted">The first row must be these headings (any order). Lists use “;”. Amounts are whole rupees; commas and ₹ are fine.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <tbody>
                  {IMPORT_COLUMNS.map((c) => (
                    <tr key={c.key} className="border-b border-line last:border-0">
                      <td className="whitespace-nowrap py-2 pr-4 font-mono text-xs text-ink">{c.key}</td>
                      <td className="py-2 pr-4">{c.required ? <Pill tone="action">Required</Pill> : <span className="text-xs text-muted">Optional</span>}</td>
                      <td className="py-2 text-ink-soft">{c.hint}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
