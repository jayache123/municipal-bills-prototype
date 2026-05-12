"use client";

import { useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ValidationSummary = {
  failed_critical: number;
  failed_warning: number;
  failed_info: number;
  errors_inserted: number;
};

type SuccessResult = {
  bill_id: string;
  status: "approved" | "pending_review" | "hard_rejected" | "already_saved";
  line_items_inserted?: number;
  warnings_inserted?: number;
  validation?: ValidationSummary;
  message?: string;
};

type NotABillResult = {
  status: "not_a_bill";
  document_type: string;
  rejection_reason: string | null;
};

type DoneResult = SuccessResult | NotABillResult;

type Phase =
  | { kind: "idle" }
  | { kind: "selected"; file: File }
  | { kind: "uploading"; file: File }
  | { kind: "done"; result: DoneResult; filename: string }
  | { kind: "error"; message: string; detail?: string };

// ── Small utilities ───────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatElapsed(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// ── Result sub-components ─────────────────────────────────────────────────────

function StatusBadge({ variant }: { variant: "ok" | "warn" | "error" | "info" }) {
  const styles = {
    ok:    { ring: "bg-green-100", icon: "text-green-600", path: "M4.5 12.75l6 6 9-13.5" },
    warn:  { ring: "bg-amber-100", icon: "text-amber-600", path: "M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" },
    error: { ring: "bg-red-100",   icon: "text-red-500",   path: "M6 18 18 6M6 6l12 12" },
    info:  { ring: "bg-zinc-100",  icon: "text-zinc-500",  path: "M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" },
  }[variant];

  return (
    <div className={`inline-flex h-11 w-11 items-center justify-center rounded-full ${styles.ring}`}>
      <svg className={`h-5 w-5 ${styles.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={styles.path} />
      </svg>
    </div>
  );
}

function StatRow({ items }: { items: { label: string; value: number }[] }) {
  return (
    <div className="mt-5 flex gap-6">
      {items.map(({ label, value }) => (
        <div key={label}>
          <p className="text-xl font-semibold text-zinc-900">{value}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  );
}

function BillIdLine({ id }: { id: string }) {
  return (
    <p className="mt-4 font-mono text-xs text-zinc-400 break-all">
      Bill ID: {id}
    </p>
  );
}

function ResetButton({ onReset }: { onReset: () => void }) {
  return (
    <button
      type="button"
      onClick={onReset}
      className="mt-6 text-sm font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
    >
      ← Upload another bill
    </button>
  );
}

// ── Result card ───────────────────────────────────────────────────────────────

function ResultCard({
  result,
  onReset,
}: {
  result: DoneResult;
  filename: string;
  onReset: () => void;
}) {
  // Not a bill
  if (result.status === "not_a_bill") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 flex flex-col">
        <StatusBadge variant="warn" />
        <h2 className="mt-4 text-base font-semibold text-amber-900">Not a Municipal Bill</h2>
        <p className="mt-1 text-sm text-amber-700">
          {result.rejection_reason ??
            "This file was not recognised as a municipal rates account."}
        </p>
        <p className="mt-2 text-xs text-amber-500">
          Detected as:{" "}
          <span className="font-mono">{result.document_type}</span>
        </p>
        <ResetButton onReset={onReset} />
      </div>
    );
  }

  const { bill_id, status, line_items_inserted, warnings_inserted, validation } = result;

  // Approved
  if (status === "approved") {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 px-6 py-8 flex flex-col">
        <StatusBadge variant="ok" />
        <h2 className="mt-4 text-base font-semibold text-green-900">Bill Approved</h2>
        <p className="mt-1 text-sm text-green-700">
          Extracted cleanly and passed all validation checks.
        </p>
        <StatRow
          items={[
            { label: "Line items", value: line_items_inserted ?? 0 },
            { label: "Warnings", value: warnings_inserted ?? 0 },
            { label: "Errors", value: validation?.errors_inserted ?? 0 },
          ]}
        />
        <BillIdLine id={bill_id} />
        <ResetButton onReset={onReset} />
      </div>
    );
  }

  // Pending review
  if (status === "pending_review") {
    const issueCount =
      (warnings_inserted ?? 0) +
      (validation?.failed_critical ?? 0) +
      (validation?.failed_warning ?? 0) +
      (validation?.failed_info ?? 0);

    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 flex flex-col">
        <StatusBadge variant="warn" />
        <h2 className="mt-4 text-base font-semibold text-amber-900">Flagged for Review</h2>
        <p className="mt-1 text-sm text-amber-700">
          {issueCount === 1
            ? "1 issue needs human review before this bill can be approved."
            : `${issueCount} issues need human review before this bill can be approved.`}
        </p>
        <StatRow
          items={[
            { label: "Line items", value: line_items_inserted ?? 0 },
            { label: "Match warnings", value: warnings_inserted ?? 0 },
            {
              label: "Validation notices",
              value: (validation?.failed_warning ?? 0) + (validation?.failed_info ?? 0),
            },
          ]}
        />
        <BillIdLine id={bill_id} />
        <ResetButton onReset={onReset} />
      </div>
    );
  }

  // Hard rejected
  if (status === "hard_rejected") {
    const critical = validation?.failed_critical ?? 0;
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-8 flex flex-col">
        <StatusBadge variant="error" />
        <h2 className="mt-4 text-base font-semibold text-red-900">Failed Validation</h2>
        <p className="mt-1 text-sm text-red-700">
          {critical === 1
            ? "1 critical check failed. This bill cannot be approved until the issue is resolved."
            : `${critical} critical checks failed. This bill cannot be approved until the issues are resolved.`}
        </p>
        <StatRow
          items={[
            { label: "Line items", value: line_items_inserted ?? 0 },
            { label: "Critical failures", value: critical },
          ]}
        />
        <BillIdLine id={bill_id} />
        <ResetButton onReset={onReset} />
      </div>
    );
  }

  // Already saved (idempotency guard)
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-8 flex flex-col">
      <StatusBadge variant="info" />
      <h2 className="mt-4 text-base font-semibold text-zinc-900">Already in Database</h2>
      <p className="mt-1 text-sm text-zinc-600">
        A bill with this invoice number has already been processed. No changes were made.
      </p>
      <BillIdLine id={bill_id} />
      <ResetButton onReset={onReset} />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tick the elapsed timer while the API call is in flight.
  useEffect(() => {
    if (phase.kind !== "uploading") return;
    setElapsed(0);
    const start = Date.now();
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [phase.kind]);

  function selectFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setPhase({ kind: "error", message: "Only PDF files are accepted." });
      return;
    }
    setPhase({ kind: "selected", file });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) selectFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) selectFile(file);
  }

  async function handleUpload() {
    if (phase.kind !== "selected") return;
    const { file } = phase;
    const filename = file.name;
    setPhase({ kind: "uploading", file });

    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/bills/upload", { method: "POST", body });
      const data = (await res.json()) as Record<string, unknown>;

      if (res.status === 422) {
        setPhase({
          kind: "done",
          filename,
          result: {
            status: "not_a_bill",
            document_type: (data.document_type as string) ?? "unknown",
            rejection_reason: (data.rejection_reason as string | null) ?? null,
          },
        });
        return;
      }

      if (!res.ok) {
        setPhase({
          kind: "error",
          message: (data.error as string) ?? "Upload failed. Please try again.",
          detail: data.detail as string | undefined,
        });
        return;
      }

      setPhase({ kind: "done", filename, result: data as SuccessResult });
    } catch (err) {
      setPhase({
        kind: "error",
        message: "Could not reach the server. Check your connection and try again.",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function reset() {
    setPhase({ kind: "idle" });
    setElapsed(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Progress hint shown beneath the timer during extraction.
  const progressHint =
    elapsed < 5
      ? "Uploading to storage…"
      : elapsed < 80
        ? "Sending to Claude for extraction…"
        : "Almost done — running validation…";

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg">

        {/* ── Header ── */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Upload a Municipal Bill
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            PDF only · max 10 MB · City of Cape Town
          </p>
        </div>

        {/* ── IDLE: drop zone ── */}
        {phase.kind === "idle" && (
          <div
            className={[
              "rounded-2xl border-2 border-dashed transition-colors duration-150",
              dragOver
                ? "border-blue-400 bg-blue-50"
                : "border-zinc-300 bg-white hover:border-zinc-400 hover:bg-zinc-50",
            ].join(" ")}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="sr-only"
              onChange={handleFileInput}
              aria-label="Choose a PDF file"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center gap-4 py-16 px-8 cursor-pointer rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {/* Upload arrow icon */}
              <div className="rounded-full bg-zinc-100 p-4">
                <svg
                  className="h-7 w-7 text-zinc-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                  />
                </svg>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-700">
                  Drop a PDF here <span className="text-zinc-400">or</span> click to browse
                </p>
                <p className="text-xs text-zinc-400">PDF · max 10 MB</p>
              </div>
            </button>
          </div>
        )}

        {/* ── SELECTED: confirm and process ── */}
        {phase.kind === "selected" && (
          <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-8 flex flex-col gap-5">
            {/* File chip */}
            <div className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
              <div className="shrink-0 rounded-lg bg-red-50 p-2">
                {/* PDF document icon */}
                <svg
                  className="h-5 w-5 text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                  />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-800">
                  {phase.file.name}
                </p>
                <p className="text-xs text-zinc-400">{formatBytes(phase.file.size)}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleUpload}
              className="w-full rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 active:scale-[0.98]"
            >
              Process Bill
            </button>

            <button
              type="button"
              onClick={() => {
                setPhase({ kind: "idle" });
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors text-center"
            >
              Choose a different file
            </button>
          </div>
        )}

        {/* ── UPLOADING: processing in progress ── */}
        {phase.kind === "uploading" && (
          <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-14 flex flex-col items-center gap-6 text-center">
            {/* Spinner */}
            <svg
              className="animate-spin h-10 w-10 text-zinc-300"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12" cy="12" r="10"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>

            <div className="space-y-1">
              <p className="text-sm font-semibold text-zinc-800">Extracting bill with AI…</p>
              <p className="text-xs text-zinc-500">This usually takes 60–90 seconds</p>
              <p className="text-xs text-zinc-400 truncate max-w-xs">{phase.file.name}</p>
            </div>

            {/* Live elapsed counter */}
            <div className="rounded-full bg-zinc-100 px-4 py-1.5">
              <span className="font-mono text-sm text-zinc-600">{formatElapsed(elapsed)}</span>
            </div>

            {/* Honest progress hint */}
            <p className="text-xs text-zinc-400">{progressHint}</p>
          </div>
        )}

        {/* ── DONE: result card ── */}
        {phase.kind === "done" && (
          <ResultCard
            result={phase.result}
            filename={phase.filename}
            onReset={reset}
          />
        )}

        {/* ── ERROR: something went wrong ── */}
        {phase.kind === "error" && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-8 flex flex-col">
            <div className="flex items-start gap-3">
              <div className="shrink-0 rounded-full bg-red-100 p-2 mt-0.5">
                <svg
                  className="h-4 w-4 text-red-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-red-800">{phase.message}</p>
                {phase.detail && (
                  <p className="mt-1 font-mono text-xs text-red-600 break-all">
                    {phase.detail}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={reset}
              className="mt-5 self-start text-sm font-medium text-red-700 hover:text-red-900 transition-colors"
            >
              ← Try again
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
