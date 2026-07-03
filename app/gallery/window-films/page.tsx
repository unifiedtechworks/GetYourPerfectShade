import type { Metadata } from "next";
import { GalleryDetailPage } from "@/components/GalleryDetailPage";
import { services } from "@/data/services";

export const metadata: Metadata = {
  title: "Window Films Gallery",
  description:
    "Placeholder gallery for residential and commercial window films that reduce heat, protect interiors, and enhance privacy."
};

export default function WindowFilmsGalleryPage() {
  return <GalleryDetailPage service={services[1]} />;
}
