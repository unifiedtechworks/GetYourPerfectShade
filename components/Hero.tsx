import Image from "next/image";
import Link from "next/link";
import { DecorativeLeaf } from "@/components/DecorativeLeaf";
import { businessInfo } from "@/data/business";
import { services } from "@/data/services";
import styles from "./Hero.module.css";

export function Hero() {
  const heroImage = services[0].image;

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
          <p className="eyebrow">{businessInfo.brandPhrase}</p>
          <h1>{businessInfo.tagline}</h1>
          <p>
            Custom shades, blinds, draperies, window films, and exterior shade solutions
            for homes and businesses in Umatilla and Morrow County.
          </p>
          <div className="buttonRow">
            <Link className="button buttonPrimary" href="/contact">
              Request a Consultation
            </Link>
            <Link className="button buttonSecondary" href="/gallery">
              View Gallery
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
