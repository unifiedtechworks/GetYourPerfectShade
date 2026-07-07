import { trustItems } from "@/data/business";
import styles from "./TrustStrip.module.css";

export function TrustStrip() {
  return (
    <section className={styles.strip} aria-label="Perfect Shade trust details">
      <div className={`container ${styles.inner}`}>
        {trustItems.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </section>
  );
}
