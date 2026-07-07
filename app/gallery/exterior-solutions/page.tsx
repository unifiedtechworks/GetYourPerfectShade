import type { Metadata } from "next";
import { GalleryDetailPage } from "@/components/GalleryDetailPage";
import { services } from "@/data/services";

export const metadata: Metadata = {
  title: "Exterior Window Coverings Gallery",
  description:
    "Explore exterior shades, screens, and awnings that add comfort, UV protection, and outdoor appeal for homes and businesses."
};

export default function ExteriorSolutionsGalleryPage() {
  return <GalleryDetailPage service={services[2]} />;
}
