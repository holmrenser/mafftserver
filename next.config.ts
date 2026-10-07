import type { NextConfig } from "next";

// Set at build time (inlined into the client bundle - see basePath docs) via
// NEXT_PUBLIC_BASE_PATH, e.g. "/iqtree" to serve behind a reverse proxy at
// bioinformatics.nl/iqtree. Empty string (the default) serves from the root.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  basePath,
};

export default nextConfig;
