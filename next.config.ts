import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Explicit workspace root: silences "multiple lockfiles" warning when this
  // tree is being developed in a git worktree alongside the parent checkout.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
