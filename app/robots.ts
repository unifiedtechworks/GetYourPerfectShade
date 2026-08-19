import type { MetadataRoute } from "next";
import { businessInfo } from "@/data/business";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/auth", "/sign-in", "/forgot-password", "/reset-password"]
    },
    sitemap: `${businessInfo.url}/sitemap.xml`
  };
}
