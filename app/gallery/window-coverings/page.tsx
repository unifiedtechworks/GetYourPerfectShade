import type { Metadata } from "next";
import { GalleryDetailPage } from "@/components/GalleryDetailPage";
import { services } from "@/data/services";

export const metadata: Metadata = {
  title: "Window Coverings Gallery",
  description:
    "Placeholder gallery for Perfect Shade custom shades, blinds, draperies, and motorized window coverings."
};

export default function WindowCoveringsGalleryPage() {
  return <GalleryDetailPage service={services[0]} />;
}
