import type { Metadata } from "next";
import { CTASection } from "@/components/CTASection";
import { businessInfo, trustItems } from "@/data/business";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn about Perfect Shade, a local window coverings business serving Hermiston, Boardman, Umatilla, Heppner, and surrounding communities."
};

export default function AboutPage() {
  return (
    <main>
      <section className="section sectionShell">
        <div className="container twoColumn">
          <div className="pageIntro">
            <p className="eyebrow">About Perfect Shade</p>
            <h1>Thoughtful window covering solutions for local homes and businesses.</h1>
            <p>
              Perfect Shade serves residential and commercial customers in Hermiston, Boardman,
              Umatilla, Heppner, and surrounding communities in Umatilla and Morrow County with
              practical, polished shade solutions.
            </p>
            <p>
              The work starts with listening: how the room feels during the day, where privacy
              matters, how heat and glare show up, and what kind of finish will feel right for
              the space. From there, product guidance, measurement, and installation stay focused
              on comfort, function, and a clean finished look.
            </p>
            <ul className="featureList">
              <li>Residential and commercial window coverings, films, and exterior solutions.</li>
              <li>Local knowledge for Umatilla and Morrow County light, heat, privacy, and durability needs.</li>
              <li>Warm service before, during, and after installation.</li>
            </ul>
          </div>
          <div className="credentialGrid" aria-label="Perfect Shade credentials">
            {trustItems.map((item) => (
              <span key={item}>{item}</span>
            ))}
            <span>{businessInfo.areaServed}</span>
          </div>
        </div>
      </section>
      <CTASection />
    </main>
  );
}
