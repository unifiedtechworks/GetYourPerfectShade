import type { Metadata } from "next";
import { GalleryDetailPage } from "@/components/GalleryDetailPage";
import { services } from "@/data/services";

export const metadata: Metadata = {
  title: "Exterior Window Coverings Gallery",
  description:
    "Placeholder gallery for exterior shades, screens, awnings, comfort, and UV protection solutions."
};

export default function ExteriorSolutionsGalleryPage() {
  return <GalleryDetailPage service={services[2]} />;
}
