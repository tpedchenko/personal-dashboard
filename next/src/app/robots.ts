import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard/", "/finance/", "/gym/", "/trading/", "/settings/"],
      },
    ],
    sitemap: "https://pd.taras.cloud/sitemap.xml",
  };
}
