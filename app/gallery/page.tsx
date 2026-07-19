import type { Metadata } from "next";
import { ProductCard } from "@/components/ProductCard";
import { SectionHeading } from "@/components/SectionHeading";
import { productOfferings } from "@/data/services";

export const metadata: Metadata = {
  title: "Products Offered",
  description:
    "Explore products offered by Perfect Shade, including roller shades, cellular shades, roman shades, blinds, draperies, motorized shades, exterior shades, solar screens, and awnings in Hermiston, Boardman, Umatilla, Heppner, Umatilla County, and Morrow County."
};

export default function ProductsOfferedPage() {
  return (
    <main className="section">
      <div className="container">
        <SectionHeading
          eyebrow="Products Offered"
          id="products-heading"
          title="Products Offered for Light, Privacy, Comfort, and Design"
          intro="Explore custom product options selected for light control, privacy, comfort, and design. Perfect Shade helps homeowners and businesses compare styles, materials, and features without overwhelming the process. Serving Hermiston, Boardman, Umatilla, Heppner, and surrounding communities in Umatilla and Morrow County."
        />
        <div className="grid3">
          {productOfferings.map((category) => (
            <ProductCard key={category.title} category={category} />
          ))}
        </div>
      </div>
    </main>
  );
}
