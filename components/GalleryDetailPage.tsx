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
            <p>{service.summary}</p>
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
          {Array.from({ length: 6 }).map((_, index) => (
            <article key={index} className={styles.placeholder}>
              <div className={styles.projectImage}>
                <Image
                  src={service.image.src}
                  alt={`${service.image.alt} example ${index + 1}`}
                  fill
                  sizes="(max-width: 860px) 100vw, 33vw"
                  className={styles.image}
                />
              </div>
              <h2>
                {service.title} project {index + 1}
              </h2>
              <p>Photo placeholder for future Perfect Shade installation imagery.</p>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
