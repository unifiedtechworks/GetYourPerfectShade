import Link from "next/link";
import { businessInfo } from "@/data/business";
import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.grid}`}>
        <div>
          <p className={styles.brand}>{businessInfo.brandPhrase}</p>
          <p>{businessInfo.tagline}</p>
          <p className={styles.serviceArea}>{businessInfo.areaServed}</p>
          <p className={styles.credentials}>
            {businessInfo.ccb} | {businessInfo.waReg}
          </p>
        </div>
        <div>
          <h2>Contact</h2>
          <a href={businessInfo.phoneHref}>{businessInfo.phone}</a>
          <a href={businessInfo.emailHref}>{businessInfo.email}</a>
        </div>
        <div>
          <h2>Explore</h2>
          <Link href="/gallery">Gallery</Link>
          <Link href="/about">About</Link>
          <Link href="/contact">Contact</Link>
        </div>
      </div>
    </footer>
  );
}
