import Link from "next/link";
import { businessInfo } from "@/data/business";
import styles from "./CTASection.module.css";

export function CTASection() {
  return (
    <section className={styles.cta} aria-labelledby="cta-heading">
      <div className={`container ${styles.inner}`}>
        <div>
          <p className="eyebrow">Ready when you are</p>
          <h2 id="cta-heading">Bring the right shade, softness, and privacy into your space.</h2>
          <p>
            Contact Perfect Shade for residential or commercial window covering solutions in
            Hermiston and the surrounding region.
          </p>
        </div>
        <div className="buttonRow">
          <Link className="button buttonPrimary" href="/contact">
            Start a Project
          </Link>
          <a className="button buttonLight" href={businessInfo.phoneHref}>
            {businessInfo.phone}
          </a>
        </div>
      </div>
    </section>
  );
}
