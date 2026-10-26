import { businessInfo } from "@/data/business";
import styles from "./BrandWordmark.module.css";

/** The existing live-text wordmark; approved image/SVG artwork is untouched. */
export function BrandWordmark() {
  const [perfect, shade] = businessInfo.name.split(" ");

  return (
    <span className={styles.wordmark}>
      <span className={styles.perfect}>{perfect}</span>{" "}
      <span className={styles.shade}>{shade}</span>
    </span>
  );
}
