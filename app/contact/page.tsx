import type { Metadata } from "next";
import { businessInfo } from "@/data/business";
import styles from "./contact.module.css";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact Perfect Shade for custom window coverings, window films, and exterior shade solutions in Hermiston and surrounding areas."
};

export default function ContactPage() {
  return (
    <main className="section sectionShell">
      <div className="container twoColumn">
        <div className="pageIntro">
          <p className="eyebrow">Contact</p>
          <h1>Request a consultation for your space.</h1>
          <p>
            Reach out for residential or commercial window coverings, window films, exterior
            shades, screens, awnings, and motorized solutions. Phone is the fastest way to start.
          </p>
          <div className={styles.contactLinks}>
            <a href={businessInfo.phoneHref}>{businessInfo.phone}</a>
            <a href={businessInfo.emailHref}>{businessInfo.email}</a>
          </div>
        </div>
        <section className={styles.panel} aria-labelledby="service-area-heading">
          <p className="eyebrow">Project details</p>
          <h2 id="service-area-heading">What to include when you reach out</h2>
          <ul>
            <li>Project location and whether it is residential or commercial.</li>
            <li>Window covering type, privacy, glare, heat, or comfort goals.</li>
            <li>Approximate timeline and any photos you would like reviewed later.</li>
          </ul>
          <div className={styles.infoBlock}>
            <strong>Service area</strong>
            <span>{businessInfo.areaServed}</span>
          </div>
          <div className={styles.infoBlock}>
            <strong>Licensing</strong>
            <span>
              {businessInfo.ccb} | {businessInfo.waReg}
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}
