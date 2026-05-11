import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("✗ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const BUCKET_NAME = "bills";
const FILE_SIZE_LIMIT_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["application/pdf"];

async function main(): Promise<void> {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  console.log(`→ Checking for bucket '${BUCKET_NAME}'...`);
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error(`✗ Failed to list buckets: ${listError.message}`);
    process.exit(1);
  }

  const existing = buckets?.find((b) => b.name === BUCKET_NAME);
  if (existing) {
    console.log(`✓ Bucket '${BUCKET_NAME}' already exists. No action needed.`);
    console.log(`    public:          ${existing.public}`);
    console.log(`    file size limit: ${existing.file_size_limit ?? "(default)"}`);
    console.log(`    allowed types:   ${(existing.allowed_mime_types ?? []).join(", ") || "(any)"}`);
    return;
  }

  console.log(`→ Creating bucket '${BUCKET_NAME}' (private, ${FILE_SIZE_LIMIT_BYTES / 1024 / 1024} MB max, PDF only)...`);
  const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
    public: false,
    fileSizeLimit: FILE_SIZE_LIMIT_BYTES,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  });

  if (createError) {
    console.error(`✗ Failed to create bucket: ${createError.message}`);
    process.exit(1);
  }

  console.log(`✓ Bucket '${BUCKET_NAME}' created.`);
}

main().catch((err) => {
  console.error("✗ Unexpected error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
