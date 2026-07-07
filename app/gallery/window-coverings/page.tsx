import type { Metadata } from "next";
import { GalleryDetailPage } from "@/components/GalleryDetailPage";
import { services } from "@/data/services";

export const metadata: Metadata = {
  title: "Window Coverings Gallery",
  description:
    "Explore custom window coverings in Hermiston, including shades, blinds, draperies, and motorized options for Umatilla and Morrow County homes and businesses."
};

export default function WindowCoveringsGalleryPage() {
  return <GalleryDetailPage service={services[0]} />;
}
