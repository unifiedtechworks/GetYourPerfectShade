import type { Metadata } from "next";
import { GalleryCard } from "@/components/GalleryCard";
import { SectionHeading } from "@/components/SectionHeading";
import { galleryCategories } from "@/data/services";

export const metadata: Metadata = {
  title: "Gallery",
  description:
    "Browse Perfect Shade gallery categories for window coverings, window films, and exterior shade solutions."
};

export default function GalleryPage() {
  return (
    <main className="section">
      <div className="container">
        <SectionHeading
          eyebrow="Gallery"
          id="gallery-heading"
          title="Project galleries organized by solution."
          intro="This scaffold is ready for client photos, product imagery, and before-and-after examples as the site grows."
        />
        <div className="grid3">
          {galleryCategories.map((category) => (
            <GalleryCard key={category.slug} category={category} />
          ))}
        </div>
      </div>
    </main>
  );
}
