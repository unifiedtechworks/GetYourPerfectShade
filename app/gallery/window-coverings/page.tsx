import type { Metadata } from "next";
import { ProductDetailPage } from "@/components/ProductDetailPage";
import { services } from "@/data/services";

export const metadata: Metadata = {
  title: "Window Covering Products",
  description:
    "Explore custom window covering products in Hermiston, including roller shades, cellular shades, roman shades, blinds, draperies, and motorized shades for homes and businesses in Umatilla and Morrow County."
};

export default function WindowCoveringProductsPage() {
  return <ProductDetailPage service={services[0]} />;
}
