import Image from "next/image";
import Link from "next/link";
import { DecorativeLeaf } from "@/components/DecorativeLeaf";
import { businessInfo } from "@/data/business";
import styles from "./Hero.module.css";

export function Hero() {
  const heroImage = {
    src: "/images/perfect-shade/window-coverings.jpg",
    alt: "Elegant living room with custom drapery and light-filtering shade"
  };

  return (
    <section className={styles.hero}>
      <div className={`container ${styles.inner}`}>
        <DecorativeLeaf
          className={styles.heroLeafTall}
          src="/images/perfect-shade/decor/leaf-tall-vertical.png"
        />
        <DecorativeLeaf
          className={styles.heroLeafCluster}
          src="/images/perfect-shade/decor/leaf-cluster-line.png"
        />
        <div className={styles.copy}>
          <div className={styles.brandLockup} aria-label={businessInfo.name}>
            <span className={styles.brandMark} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>
              <strong>{businessInfo.name}</strong>
              <small>Window Coverings & Solutions</small>
            </span>
          </div>
          <p className="eyebrow">Custom window coverings for beautiful spaces</p>
          <h1>{businessInfo.tagline}</h1>
          <p>
            Custom roller shades, cellular shades, roman shades, blinds, draperies,
            motorized options, and exterior shade solutions for homes and businesses
            in Umatilla and Morrow County.
          </p>
          <div className="buttonRow">
            <Link className="button buttonPrimary" href="/contact">
              Request a Consultation
            </Link>
            <Link className="button buttonSecondary" href="/gallery">
              Products Offered
            </Link>
          </div>
        </div>
        <div className={styles.visual} aria-label="Decorative window covering preview">
          <Image
            src={heroImage.src}
            alt={heroImage.alt}
            fill
            priority
            sizes="(max-width: 860px) 100vw, 42vw"
            className={styles.heroImage}
          />
        </div>
      </div>
    </section>
  );
}
