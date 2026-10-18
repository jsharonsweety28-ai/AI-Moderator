import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship the cached demo-path LLM responses with every serverless function so
  // the rehearsed demo never depends on a live model round-trip. Writes to the
  // cache fail silently on Vercel's read-only filesystem; reads work.
  outputFileTracingIncludes: {
    "/**": ["./.llm-cache/**/*"],
  },
};

export default nextConfig;
