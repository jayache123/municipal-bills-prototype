import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";

// Same override-true pattern as scripts/ — Claude Code exports ANTHROPIC_API_KEY=""
// by default, which prevents Next.js's built-in env loading from picking up .env.local.
loadEnv({ path: ".env.local", override: true });

const nextConfig: NextConfig = {
  // Explicit workspace root: silences "multiple lockfiles" warning when this
  // tree is being developed in a git worktree alongside the parent checkout.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
