import { randomUUID } from "node:crypto";
import { getSupabaseServiceClient } from "./server";

export const BILLS_BUCKET = "bills";

export type UploadBillPdfArgs = {
  fileBuffer: Buffer;
  filename: string;
  /** Defaults to "now". Controls the year/month folder partitioning. */
  uploadedAt?: Date;
};

export type UploadBillPdfResult = {
  bucket: string;
  storagePath: string;
  originalFilename: string;
  sizeBytes: number;
};

/**
 * Upload a PDF buffer to the bills bucket under `{year}/{month}/{uuid}.pdf`.
 * Returns the storage path (what gets saved in `bills.raw_pdf_url`).
 *
 * Year/month partitioning makes the bucket easy to browse and keeps any one
 * folder from growing without bound. UUID filenames prevent collisions and
 * leak nothing about the bill's contents.
 */
export async function uploadBillPdf(args: UploadBillPdfArgs): Promise<UploadBillPdfResult> {
  const supabase = getSupabaseServiceClient();
  const uploadedAt = args.uploadedAt ?? new Date();
  const year = String(uploadedAt.getUTCFullYear());
  const month = String(uploadedAt.getUTCMonth() + 1).padStart(2, "0");
  const uuid = randomUUID();

  const storagePath = `${year}/${month}/${uuid}.pdf`;

  const { error } = await supabase.storage
    .from(BILLS_BUCKET)
    .upload(storagePath, args.fileBuffer, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload PDF to ${BILLS_BUCKET}/${storagePath}: ${error.message}`);
  }

  return {
    bucket: BILLS_BUCKET,
    storagePath,
    originalFilename: args.filename,
    sizeBytes: args.fileBuffer.length,
  };
}

/**
 * Generate a short-lived signed URL for downloading a PDF from the bills
 * bucket. Used by the review screen to embed the PDF viewer.
 */
export async function getBillPdfSignedUrl(
  storagePath: string,
  expiresInSeconds = 60 * 10,
): Promise<string> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.storage
    .from(BILLS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data) {
    throw new Error(`Failed to sign URL for ${storagePath}: ${error?.message ?? "no data"}`);
  }
  return data.signedUrl;
}
