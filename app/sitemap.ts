import type { MetadataRoute } from "next";
import { businessInfo } from "@/data/business";

const routes = [
  "",
  "/gallery",
  "/gallery/window-coverings",
  "/gallery/window-films",
  "/gallery/exterior-solutions",
  "/about",
  "/contact"
];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${businessInfo.url}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "monthly" : "yearly",
    priority: route === "" ? 1 : 0.7
  }));
}
