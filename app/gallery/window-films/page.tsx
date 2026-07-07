import type { Metadata } from "next";
import { GalleryDetailPage } from "@/components/GalleryDetailPage";
import { services } from "@/data/services";

export const metadata: Metadata = {
  title: "Window Films Gallery",
  description:
    "Learn about residential and commercial window films that help reduce heat, soften glare, protect interiors, and improve privacy."
};

export default function WindowFilmsGalleryPage() {
  return <GalleryDetailPage service={services[1]} />;
}
