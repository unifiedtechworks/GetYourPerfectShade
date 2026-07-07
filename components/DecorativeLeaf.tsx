import styles from "./DecorativeLeaf.module.css";

type DecorativeLeafProps = {
  className?: string;
  src: string;
};

export function DecorativeLeaf({ className = "", src }: DecorativeLeafProps) {
  return (
    <span className={`${styles.leaf} ${className}`} aria-hidden="true">
      <img src={src} alt="" loading="lazy" decoding="async" className={styles.image} />
    </span>
  );
}
