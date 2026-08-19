import type { Metadata } from "next";
import { ProductCard } from "@/components/ProductCard";
import { SectionHeading } from "@/components/SectionHeading";
import { productOfferings } from "@/data/services";

const description =
  "Explore products offered by Perfect Shade, including roller shades, cellular shades, roman shades, blinds, draperies, motorized shades, exterior shades, solar screens, and awnings in Hermiston, Boardman, Umatilla, Heppner, Umatilla County, and Morrow County.";

export const metadata: Metadata = {
  title: "Products Offered",
  description,
  alternates: {
    canonical: "/gallery"
  },
  openGraph: {
    title: "Products Offered | Perfect Shade",
    description,
    url: "/gallery",
    images: [
      {
        url: "/images/perfect-shade/products/roller-shades.jpg",
        width: 1448,
        height: 1086,
        alt: "Living room with custom roller shades filtering natural light"
      }
    ]
  }
};

export default function ProductsOfferedPage() {
  return (
    <main id="main-content" className="section">
      <div className="container">
        <SectionHeading
          eyebrow="Products Offered"
          id="products-heading"
          level="h1"
          title="Products Offered for Light, Privacy, Comfort, and Design"
          intro="Explore custom product options selected for light control, privacy, comfort, and design. Perfect Shade helps homeowners and businesses compare styles, materials, and features without overwhelming the process. Serving Hermiston, Boardman, Umatilla, Heppner, and surrounding communities in Umatilla and Morrow County."
        />
        <div className="grid3">
          {productOfferings.map((category, index) => (
            <ProductCard
              key={category.title}
              category={category}
              eager={index === 0}
              headingLevel="h2"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
