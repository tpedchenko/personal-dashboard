import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import { withSerwist } from "@serwist/turbopack";

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["pdf-parse"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // Note: 'unsafe-inline' in script-src is needed for Next.js inline scripts;
          // 'unsafe-eval' was removed — Recharts ESM build does not require it.
          // 'unsafe-inline' in style-src is needed for Tailwind/styled-jsx.
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://generativelanguage.googleapis.com https://api.groq.com https://*.google.com https://*.googleapis.com; frame-ancestors 'none';" },
        ],
      },
    ];
  },
};

export default withSerwist(withNextIntl(nextConfig));
