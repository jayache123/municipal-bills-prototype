import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ANTHROPIC_API_KEY) {
  console.error("✗ Missing required env vars. Check .env.local has:");
  console.error("    SUPABASE_URL");
  console.error("    SUPABASE_SERVICE_ROLE_KEY");
  console.error("    ANTHROPIC_API_KEY");
  process.exit(1);
}

type Setting = { key: string; value: string };

async function testSupabase(): Promise<Setting[] | null> {
  console.log("→ Testing Supabase connection...");
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  const { data, error } = await supabase
    .from("settings")
    .select("key, value")
    .order("key");

  if (error) {
    console.error(`✗ Supabase error: ${error.message}`);
    return null;
  }
  if (!data || data.length === 0) {
    console.error("✗ Supabase connected, but no settings rows found.");
    console.error("  Did the schema seed run? Re-run supabase/schema.sql.");
    return null;
  }

  console.log(`✓ Supabase connected. ${data.length} settings loaded:`);
  for (const row of data) {
    console.log(`    ${row.key.padEnd(38)} = ${row.value}`);
  }
  return data;
}

async function testAnthropic(model: string): Promise<void> {
  console.log(`\n→ Testing Anthropic connection (model: ${model})...`);
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY! });

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 50,
      messages: [{ role: "user", content: "Reply with just the word 'ok'." }],
    });

    const text = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("")
      .trim();

    console.log(`✓ Anthropic connected. Claude says: "${text}"`);
    console.log(
      `    (used ${response.usage.input_tokens} input + ${response.usage.output_tokens} output tokens)`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`✗ Anthropic error: ${message}`);
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const settings = await testSupabase();
  if (!settings) {
    process.exitCode = 1;
    return;
  }
  const modelSetting = settings.find((s) => s.key === "anthropic_model");
  const model = modelSetting?.value ?? "claude-sonnet-4-6";
  await testAnthropic(model);
}

main();
