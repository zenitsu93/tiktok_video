import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// one .env at the root of the repository serves the web app and the worker
const rootEnv = resolve(import.meta.dirname, "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@regie/core", "@regie/db", "@regie/server"],
  serverExternalPackages: ["pg-boss", "postgres", "@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"],
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    ];
    return [
      { source: "/:path*", headers: common },
      // the preview frame has an opaque origin: fonts and scripts it loads need CORS
      { source: "/vendor/:path*", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }, { key: "Cache-Control", value: "public, max-age=604800" }] },
    ];
  },
};

export default config;
