import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module; keep it out of the server bundle.
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  // Keep the dev overlay badge out of demo recordings.
  devIndicators: false,
};

export default nextConfig;
