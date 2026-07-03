"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { businessInfo } from "@/data/business";
import styles from "./Header.module.css";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/gallery", label: "Gallery" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" }
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Link className={styles.brand} href="/" aria-label="Perfect Shade home">
          <span className={styles.mark}>PS</span>
          <span>
            <strong>{businessInfo.name}</strong>
            <small>Window Coverings & Solutions</small>
          </span>
        </Link>
        <nav className={styles.nav} aria-label="Primary navigation">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname === item.href ? styles.active : undefined}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <a className={styles.phone} href={businessInfo.phoneHref}>
          {businessInfo.phone}
        </a>
      </div>
    </header>
  );
}
