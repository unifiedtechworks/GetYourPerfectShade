import type { Metadata } from "next";
import "./globals.css";
import { LocalBusinessJsonLd } from "@/components/LocalBusinessJsonLd";
import { SiteChrome } from "@/components/SiteChrome";
import { businessInfo } from "@/data/business";

export const metadata: Metadata = {
  metadataBase: new URL(businessInfo.url),
  title: {
    default: "Perfect Shade | Window Coverings & Solutions",
    template: "%s | Perfect Shade"
  },
  description:
    "Perfect Shade provides custom window coverings, motorized shades, exterior shades, solar screens, and awnings for homes and businesses in Hermiston, Boardman, Umatilla, Heppner, and nearby communities.",
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
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
