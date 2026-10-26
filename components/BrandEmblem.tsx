import styles from "./BrandEmblem.module.css";

type BrandEmblemProps = {
  className?: string;
  tone?: "light" | "dark";
};

/** Vector recreation from the vehicle photos, not the original production artwork. */
export function BrandEmblem({ className = "", tone = "light" }: BrandEmblemProps) {
  return (
    <svg
      className={`${styles.emblem} ${tone === "dark" ? styles.onDark : ""} ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 160 104"
      width="160"
      height="104"
      aria-hidden="true"
      focusable="false"
    >
      <g className={styles.slats}>
        <path d="M5 11h104v5.5H5zM5 21.5h104V27H5zM5 32h104v5.5H5zM5 42.5h104V48H5zM5 53h104v5.5H5zM5 63.5h104V69H5zM5 74h104v5.5H5z" />
      </g>
      <path className={styles.cord} d="M16 10v81" />
      <path className={styles.slats} d="M16 89c-1.1 2.6-4 4.7-4 7.1 0 2.1 1.8 3.9 4 3.9s4-1.8 4-3.9c0-2.4-2.9-4.5-4-7.1Z" />
      <path
        className={styles.curtain}
        d="M78 4h77v86h-40C94 70 82 39 78 4Z"
      />
      <g className={styles.folds}>
        <path d="M87 4h6c4 35 15 64 33 86h-5C102 69 91 39 87 4Z" />
        <path d="M105 4h10c0 35 9 65 25 86h-6c-18-23-26-52-29-86Z" />
        <path d="M130 4h9c-2 33 3 64 12 86h-5c-11-23-14-52-16-86Z" />
      </g>
    </svg>
  );
}
