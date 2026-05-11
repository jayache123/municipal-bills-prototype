import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { readFileSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { uploadBillPdf, getBillPdfSignedUrl } from "../src/lib/supabase/storage";

const pdfPathArg = process.argv[2];
if (!pdfPathArg) {
  console.error("Usage: npm run test:storage -- <path-to-pdf>");
  process.exit(1);
}

const pdfPath = resolve(pdfPathArg);
if (!existsSync(pdfPath)) {
  console.error(`✗ File not found: ${pdfPath}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const fileBuffer = readFileSync(pdfPath);
  const filename = basename(pdfPath);
  console.log(`→ Read ${filename} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);

  console.log(`→ Uploading to Supabase Storage...`);
  const start = Date.now();
  const result = await uploadBillPdf({ fileBuffer, filename });
  const elapsedMs = Date.now() - start;

  console.log(`✓ Uploaded in ${elapsedMs} ms`);
  console.log(`    bucket:        ${result.bucket}`);
  console.log(`    storage path:  ${result.storagePath}`);
  console.log(`    full ref:      ${result.bucket}/${result.storagePath}`);

  console.log(`→ Generating a signed URL (valid 10 minutes)...`);
  const signedUrl = await getBillPdfSignedUrl(result.storagePath);
  console.log(`✓ Signed URL:`);
  console.log(`    ${signedUrl}`);
}

main().catch((err) => {
  console.error("✗ Upload failed:", err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
