import type { MetadataRoute } from "next";
import { businessInfo } from "@/data/business";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/"
    },
    sitemap: `${businessInfo.url}/sitemap.xml`
  };
}
