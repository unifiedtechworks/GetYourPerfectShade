import type { Metadata } from "next";
import { Suspense } from "react";
import { ProductDetailPage } from "@/components/ProductDetailPage";
import { services } from "@/data/services";

const description =
  "Explore exterior shades, solar screens, and awnings that add comfort, UV protection, and outdoor appeal for homes and businesses in Umatilla and Morrow County.";

export const metadata: Metadata = {
  title: "Exterior Shade Solutions",
  description,
  alternates: {
    canonical: "/gallery/exterior-solutions"
  },
  openGraph: {
    title: "Exterior Shade Solutions | Perfect Shade",
    description,
    url: "/gallery/exterior-solutions"
  }
};

export default function ExteriorShadeSolutionsPage() {
  return (
    <Suspense fallback={null}>
      <ProductDetailPage service={services[1]} />
    </Suspense>
  );
}
