import type { Metadata } from "next";
import { GalleryCard } from "@/components/GalleryCard";
import { SectionHeading } from "@/components/SectionHeading";
import { galleryCategories } from "@/data/services";

export const metadata: Metadata = {
  title: "Window Covering Solutions Gallery",
  description:
    "Explore custom window coverings in Hermiston, residential and commercial window films, and exterior shade solutions for Umatilla and Morrow County."
};

export default function GalleryPage() {
  return (
    <main className="section">
      <div className="container">
        <SectionHeading
          eyebrow="Gallery"
          id="gallery-heading"
          title="Explore Window Covering Solutions for Every Space"
          intro="Browse Perfect Shade's main product categories, from custom interior shades and draperies to commercial window films and exterior shade solutions. Each option is selected to help improve comfort, privacy, light control, and the finished look of your home or business. Serving Hermiston, Boardman, Umatilla, Heppner, and surrounding communities in Umatilla and Morrow County."
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
