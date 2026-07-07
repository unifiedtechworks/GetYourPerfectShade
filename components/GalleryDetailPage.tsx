import Image from "next/image";
import Link from "next/link";
import type { Service } from "@/data/services";
import styles from "./GalleryDetailPage.module.css";

export function GalleryDetailPage({ service }: { service: Service }) {
  return (
    <main className="section">
      <div className="container">
        <Link className={styles.backLink} href="/gallery">
          Back to gallery
        </Link>
        <div className={styles.header}>
          <div>
            <p className="eyebrow">Gallery</p>
            <h1>{service.title}</h1>
            <p>{service.detailIntro}</p>
            <ul>
              {service.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className={styles.featureImage}>
            <Image
              src={service.image.src}
              alt={service.image.alt}
              fill
              sizes="(max-width: 860px) 100vw, 42vw"
              className={styles.image}
            />
          </div>
        </div>
        <div className={styles.grid}>
          {service.galleryCards.map((card, index) => (
            <article key={card.title} className={styles.galleryItem}>
              <div className={styles.projectImage}>
                <Image
                  src={service.image.src}
                  alt={`${service.image.alt} example ${index + 1}`}
                  fill
                  sizes="(max-width: 860px) 100vw, 33vw"
                  className={styles.image}
                />
              </div>
              <h2>{card.title}</h2>
              <p>{card.description}</p>
            </article>
          ))}
        </div>
        <section className={styles.details} aria-labelledby="details-heading">
          <div>
            <p className="eyebrow">Options</p>
            <h2 id="details-heading">Details to compare during your consultation.</h2>
          </div>
          <div className={styles.detailGrid}>
            {service.highlights.map((highlight) => (
              <article key={highlight.title}>
                <h3>{highlight.title}</h3>
                <p>{highlight.description}</p>
              </article>
            ))}
          </div>
        </section>
        <section className={styles.cta} aria-labelledby="gallery-cta-heading">
          <div>
            <p className="eyebrow">Need guidance?</p>
            <h2 id="gallery-cta-heading">Not sure which option is right for your space?</h2>
            <p>
              Perfect Shade can help you compare products, finishes, and features during
              your consultation.
            </p>
          </div>
          <div className="buttonRow">
            <Link className="button buttonPrimary" href="/contact">
              Request a Consultation
            </Link>
            <Link className="button buttonLight" href="tel:5415714675">
              Call 541-571-4675
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
