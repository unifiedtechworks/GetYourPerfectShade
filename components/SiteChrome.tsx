"use client";

import { usePathname } from "next/navigation";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";

const standalonePrefixes = ["/sign-in", "/forgot-password", "/reset-password", "/auth", "/app"];

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const standalone = standalonePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (standalone) return children;

  return (
    <>
      <Header />
      {children}
      <Footer />
    </>
  );
}
