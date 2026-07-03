import Image from "next/image";
import Link from "next/link";
import type { Service } from "@/data/services";
import styles from "./ServiceCard.module.css";

export function ServiceCard({ service }: { service: Service }) {
  return (
    <article className={styles.card}>
      <div className={styles.body}>
        <div className={styles.icon} aria-hidden="true">
          {service.icon}
        </div>
        <p className={styles.eyebrow}>{service.eyebrow}</p>
        <h3>{service.title}</h3>
        <p>{service.summary}</p>
        <ul>
          {service.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <Link href={service.href}>Explore {service.title}</Link>
      </div>
      <div className={styles.preview}>
        <Image
          src={service.image.src}
          alt={service.image.alt}
          fill
          sizes="(max-width: 860px) 100vw, 33vw"
          className={styles.image}
        />
      </div>
    </article>
  );
}
