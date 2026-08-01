"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { businessInfo } from "@/data/business";
import styles from "./Header.module.css";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/gallery", label: "Products Offered" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" }
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <a className={styles.skipLink} href="#main-content">
        Skip to main content
      </a>
      <div className={`container ${styles.inner}`}>
        <Link className={styles.brand} href="/" aria-label="Perfect Shade home">
          <span className={styles.mark} aria-hidden="true">
            <span className={styles.blindIcon}>
              <span />
              <span />
              <span />
            </span>
          </span>
          <span>
            <strong>{businessInfo.name}</strong>
            <small>Window Coverings & Solutions</small>
          </span>
        </Link>
        <nav className={styles.nav} aria-label="Primary navigation">
          {navItems.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? styles.active : undefined}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <a className={styles.phone} href={businessInfo.phoneHref}>
          {businessInfo.phone}
        </a>
      </div>
    </header>
  );
}
