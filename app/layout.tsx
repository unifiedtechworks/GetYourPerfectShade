import type { Metadata } from "next";
import "./globals.css";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { LocalBusinessJsonLd } from "@/components/LocalBusinessJsonLd";
import { businessInfo } from "@/data/business";

export const metadata: Metadata = {
  metadataBase: new URL(businessInfo.url),
  title: {
    default: "Perfect Shade | Window Coverings & Solutions",
    template: "%s | Perfect Shade"
  },
  description:
    "Perfect Shade provides custom window coverings, window films, and exterior shade solutions for homes and businesses in Hermiston and Eastern Oregon.",
  openGraph: {
    title: "Perfect Shade — Window Coverings & Solutions",
    description: "Beautiful by design. Made for your space.",
    url: businessInfo.url,
    siteName: "Perfect Shade",
    locale: "en_US",
    type: "website"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <LocalBusinessJsonLd />
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
