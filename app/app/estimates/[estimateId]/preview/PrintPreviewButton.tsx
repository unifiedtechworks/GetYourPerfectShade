"use client";

import styles from "./preview.module.css";

export function PrintPreviewButton() {
  return (
    <button className={styles.printButton} onClick={() => window.print()} type="button">
      Print preview
    </button>
  );
}
