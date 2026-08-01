import type { Metadata } from "next";
import { Suspense } from "react";
import { ProductDetailPage } from "@/components/ProductDetailPage";
import { services } from "@/data/services";

const description =
  "Explore custom window covering products in Hermiston, including roller shades, cellular shades, roman shades, blinds, draperies, and motorized shades for homes and businesses in Umatilla and Morrow County.";

export const metadata: Metadata = {
  title: "Window Covering Products",
  description,
  alternates: {
    canonical: "/gallery/window-coverings"
  },
  openGraph: {
    title: "Window Covering Products | Perfect Shade",
    description,
    url: "/gallery/window-coverings"
  }
};

export default function WindowCoveringProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductDetailPage service={services[0]} />
    </Suspense>
  );
}
