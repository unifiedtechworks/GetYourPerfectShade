import Image from "next/image";
import Link from "next/link";
import { businessInfo } from "@/data/business";
import { services } from "@/data/services";
import styles from "./Hero.module.css";

export function Hero() {
  const heroImage = services[0].image;

  return (
    <section className={styles.hero}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.copy}>
          <p className="eyebrow">{businessInfo.brandPhrase}</p>
          <h1>{businessInfo.tagline}</h1>
          <p>
            Custom shades, blinds, draperies, window films, and exterior shade solutions
            for Hermiston-area homes and businesses.
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
