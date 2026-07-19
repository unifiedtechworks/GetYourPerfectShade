import type { Metadata } from "next";
import { ProductDetailPage } from "@/components/ProductDetailPage";
import { services } from "@/data/services";

export const metadata: Metadata = {
  title: "Exterior Shade Solutions",
  description:
    "Explore exterior shades, solar screens, and awnings that add comfort, UV protection, and outdoor appeal for homes and businesses in Umatilla and Morrow County."
};

export default function ExteriorShadeSolutionsPage() {
  return <ProductDetailPage service={services[1]} />;
}
