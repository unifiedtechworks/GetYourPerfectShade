import type { Metadata } from "next";
import { CTASection } from "@/components/CTASection";
import { GalleryCard } from "@/components/GalleryCard";
import { Hero } from "@/components/Hero";
import { ProcessSteps } from "@/components/ProcessSteps";
import { SectionHeading } from "@/components/SectionHeading";
import { ServiceCard } from "@/components/ServiceCard";
import { TrustStrip } from "@/components/TrustStrip";
import { trustItems } from "@/data/business";
import { galleryCategories, services } from "@/data/services";

export const metadata: Metadata = {
  title: "Custom Window Coverings in Hermiston, Oregon",
  description:
    "Custom shades, blinds, draperies, window films, screens, awnings, and exterior shade solutions for residential and commercial spaces."
};

export default function HomePage() {
  return (
    <main>
      <Hero />
      <TrustStrip />

      <section className="section sectionAlt sectionShell" aria-labelledby="solutions-heading">
        <div className="container">
          <SectionHeading
            eyebrow="Solutions"
            title="Window treatments tailored to light, privacy, and comfort."
            intro="Perfect Shade helps homeowners and businesses choose coverings that look refined, perform beautifully, and fit the way each space is used."
          />
          <div className="grid3">
            {services.map((service) => (
              <ServiceCard key={service.slug} service={service} />
            ))}
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="why-heading">
        <div className="container twoColumn">
          <div>
            <p className="eyebrow">Why Perfect Shade</p>
            <h2 id="why-heading">Local product guidance, careful measurements, and support after the sale.</h2>
            <p>
              Perfect Shade helps homeowners and businesses make confident choices for privacy,
              heat, glare, comfort, and design. You get practical recommendations, a measured
              fit, and a finished look that belongs in your space.
            </p>
            <p>
              Serving Hermiston, Umatilla County, Morrow County, and nearby Eastern Oregon and
              Washington communities with residential and commercial shade solutions.
            </p>
            <ul className="featureList">
              <li>Interior and exterior solutions for homes, offices, storefronts, and patios.</li>
              <li>Guidance across shades, blinds, draperies, films, screens, awnings, and motorization.</li>
              <li>Installation support that keeps comfort, function, and long-term use in mind.</li>
            </ul>
          </div>
          <div className="softPanel whyList" aria-label="Business credentials">
            {trustItems.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
      </section>

      <ProcessSteps />

      <section className="section sectionAlt sectionShell" aria-labelledby="gallery-heading">
        <div className="container">
          <SectionHeading
            eyebrow="Gallery"
            id="gallery-heading"
            title="A first look at future project galleries."
            intro="Placeholder areas are ready for real client photos, product detail shots, and before-and-after project images."
          />
          <div className="grid3">
            {galleryCategories.map((category) => (
              <GalleryCard key={category.slug} category={category} />
            ))}
          </div>
        </div>
      </section>

      <CTASection />
    </main>
  );
}
