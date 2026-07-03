import { businessInfo } from "@/data/business";

export function LocalBusinessJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: businessInfo.name,
    url: businessInfo.url,
    telephone: businessInfo.phone,
    email: businessInfo.email,
    description:
      "Custom window coverings, window films, and exterior shade solutions for residential and commercial projects.",
    address: {
      "@type": "PostalAddress",
      addressLocality: businessInfo.addressLocality,
      addressRegion: businessInfo.addressRegion,
      addressCountry: "US"
    },
    areaServed: businessInfo.areaServed,
    slogan: businessInfo.tagline
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
