import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { uploadBillPdf } from "@/lib/supabase/storage";
import { extractBill } from "@/lib/anthropic/extract";
import { matchExtractedBill } from "@/lib/billing/match";
import { saveExtractedBill } from "@/lib/billing/save";
import { validateBill } from "@/lib/billing/validate";

// Allow up to 5 minutes — Anthropic extraction takes 60–90 s.
export const maxDuration = 300;

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB — matches the bills Storage bucket limit

function err(message: string, status: number, detail?: string): NextResponse {
  return NextResponse.json({ error: message, ...(detail ? { detail } : {}) }, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Parse multipart/form-data ─────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return err("Could not parse form data. Send multipart/form-data with a 'file' field.", 400);
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return err("Missing 'file' field. Include the PDF as a multipart field named 'file'.", 400);
  }

  const isPdf =
    file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
  if (!isPdf) {
    return err(`File must be a PDF. Received: name='${file.name}', type='${file.type}'.`, 400);
  }

  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_PDF_BYTES) {
    return err(
      `File exceeds the 10 MB limit (received ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)} MB).`,
      400,
    );
  }

  const pdfBuffer = Buffer.from(arrayBuffer);
  const pdfBase64 = pdfBuffer.toString("base64");

  // ── 2. Load settings ─────────────────────────────────────────────────────
  const supabase = getSupabaseServiceClient();

  const { data: settingsRows, error: settingsError } = await supabase
    .from("settings")
    .select("key, value");
  if (settingsError) {
    return err("Failed to load settings from database.", 500, settingsError.message);
  }

  const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value]));
  const model: string = settings.anthropic_model ?? "claude-sonnet-4-6";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return err("ANTHROPIC_API_KEY is not configured on the server.", 500);
  }

  // ── 3. Upload PDF to Supabase Storage ────────────────────────────────────
  let upload: Awaited<ReturnType<typeof uploadBillPdf>>;
  try {
    upload = await uploadBillPdf({ fileBuffer: pdfBuffer, filename: file.name });
  } catch (e) {
    return err("Failed to upload PDF to storage.", 500, e instanceof Error ? e.message : String(e));
  }

  const rawPdfUrl = `${upload.bucket}/${upload.storagePath}`;

  // ── 4. Extract with Anthropic ─────────────────────────────────────────────
  let extraction: Awaited<ReturnType<typeof extractBill>>["result"];
  try {
    const resp = await extractBill({ apiKey, model, pdfBase64 });
    extraction = resp.result;
  } catch (e) {
    return err(
      "Anthropic extraction failed.",
      500,
      e instanceof Error ? e.message : String(e),
    );
  }

  // ── 5. Reject non-bills ───────────────────────────────────────────────────
  if (extraction.document_type !== "municipal_bill" || !extraction.bill) {
    return NextResponse.json(
      {
        error: "Document is not a municipal bill and cannot be processed.",
        document_type: extraction.document_type,
        rejection_reason: extraction.rejection_reason ?? null,
      },
      { status: 422 },
    );
  }

  // ── 6. Match properties ───────────────────────────────────────────────────
  let match: Awaited<ReturnType<typeof matchExtractedBill>>;
  try {
    match = await matchExtractedBill(supabase, extraction);
  } catch (e) {
    return err(
      "Property matching failed.",
      500,
      e instanceof Error ? e.message : String(e),
    );
  }

  // ── 7. Save to database ───────────────────────────────────────────────────
  let saved: Awaited<ReturnType<typeof saveExtractedBill>>;
  try {
    saved = await saveExtractedBill(supabase, {
      extraction,
      match,
      rawPdfUrl,
      rawPdfFilename: upload.originalFilename,
      extractionModel: model,
      force: false,
    });
  } catch (e) {
    return err(
      "Failed to save bill to database.",
      500,
      e instanceof Error ? e.message : String(e),
    );
  }

  // If the bill was already saved, return the existing id without re-validating.
  if (saved.was_already_saved) {
    return NextResponse.json(
      {
        bill_id: saved.bill_id,
        status: "already_saved",
        message:
          "A bill with this tax_invoice_number already exists in the database. " +
          "No changes were made.",
      },
      { status: 200 },
    );
  }

  // ── 8. Validate (hard checks → status routing) ────────────────────────────
  let validation: Awaited<ReturnType<typeof validateBill>>;
  try {
    validation = await validateBill(supabase, {
      bill_id: saved.bill_id,
      bill: extraction.bill,
      source_type: extraction.source_type,
    });
  } catch (e) {
    return err(
      "Validation failed after save.",
      500,
      e instanceof Error ? e.message : String(e),
    );
  }

  // ── 9. Return result ──────────────────────────────────────────────────────
  return NextResponse.json({
    bill_id: saved.bill_id,
    status: validation.status,
    entities_created: saved.entities_created,
    line_items_inserted: saved.line_items_inserted,
    warnings_inserted: saved.warnings_inserted,
    validation: {
      failed_critical: validation.failed_critical,
      failed_warning: validation.failed_warning,
      failed_info: validation.failed_info,
      errors_inserted: validation.errors_inserted,
    },
  });
}
