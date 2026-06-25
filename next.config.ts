import type { NextConfig } from "next";

const buildId = process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now());

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: buildId,
  },
};

export default nextConfig;
