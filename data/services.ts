export type Service = {
  title: string;
  slug: string;
  href: string;
  summary: string;
  detailIntro: string;
  eyebrow: string;
  icon: string;
  image: {
    src: string;
    alt: string;
  };
  items: string[];
  highlights: {
    title: string;
    description: string;
  }[];
  galleryCards: {
    title: string;
    description: string;
  }[];
};

export const services: Service[] = [
  {
    title: "Window Coverings",
    slug: "window-coverings",
    href: "/gallery/window-coverings",
    summary:
      "Custom shades, blinds, draperies, and motorized options designed for privacy, light control, and everyday comfort.",
    detailIntro:
      "Interior window coverings should do more than finish a room. The right shades, blinds, or draperies can soften natural light, improve privacy, reduce glare, and bring the entire space together. Perfect Shade helps homeowners and businesses choose window treatments that match the way each room is used, from everyday comfort to a polished finished look.",
    eyebrow: "Interior comfort",
    icon: "WC",
    image: {
      src: "/images/perfect-shade/window-coverings.jpg",
      alt: "Elegant living room with custom drapery and light-filtering shade"
    },
    items: ["Shades", "Blinds", "Draperies", "Motorization"],
    highlights: [
      {
        title: "Shades",
        description:
          "A refined option for soft light control, privacy, insulation, and a clean finished look."
      },
      {
        title: "Blinds",
        description:
          "Adjustable slats make it easy to manage sunlight, views, and privacy throughout the day."
      },
      {
        title: "Draperies",
        description:
          "Custom fabric treatments add warmth, texture, softness, and a more complete room design."
      },
      {
        title: "Motorization",
        description:
          "Motorized options add convenience for large windows, hard-to-reach areas, and everyday comfort."
      }
    ],
    galleryCards: [
      {
        title: "Soft Light for Living Spaces",
        description:
          "Layered shades and draperies can filter daylight while keeping a room warm, welcoming, and private."
      },
      {
        title: "Everyday Privacy",
        description:
          "Blinds and shades help bedrooms, offices, and street-facing rooms feel more comfortable day and night."
      },
      {
        title: "Finished Room Design",
        description:
          "Fabric, color, texture, and hardware choices can bring windows into the overall design of the space."
      },
      {
        title: "Large Window Solutions",
        description:
          "Measured products help wide or tall windows feel intentional while managing glare and heat."
      },
      {
        title: "Convenient Motorized Options",
        description:
          "Motorized coverings make daily light control easier for busy homes, offices, and hard-to-reach windows."
      },
      {
        title: "Professional Fit",
        description:
          "Careful measurement and installation help each treatment operate smoothly and look properly finished."
      }
    ]
  },
  {
    title: "Window Films",
    slug: "window-films",
    href: "/gallery/window-films",
    summary:
      "Residential and commercial films that help reduce heat, soften glare, protect interiors, and improve privacy.",
    detailIntro:
      "Window film is a clean, practical way to improve comfort without changing the look of your space. It can help reduce heat, soften glare, add privacy, and protect flooring, furniture, merchandise, and interior finishes from daily sun exposure. Perfect Shade works with both homes and commercial spaces that need practical performance from their glass.",
    eyebrow: "Performance glass",
    icon: "WF",
    image: {
      src: "/images/perfect-shade/window-films.jpg",
      alt: "Modern office with large windows suitable for heat and glare reducing window film"
    },
    items: ["Residential & Commercial", "Reduce Heat", "Protect Interiors", "Enhance Privacy", "Reduce Glare"],
    highlights: [
      {
        title: "Residential & Commercial",
        description:
          "Film solutions can support comfort in homes, offices, storefronts, and other glass-heavy spaces."
      },
      {
        title: "Reduce Heat",
        description:
          "The right film can help limit solar heat gain and make sunny rooms more comfortable."
      },
      {
        title: "Protect Interiors",
        description:
          "Window film helps reduce daily sun exposure on flooring, furniture, merchandise, and finishes."
      },
      {
        title: "Enhance Privacy",
        description:
          "Privacy-focused films can soften views into a space while keeping a clean, professional appearance."
      }
    ],
    galleryCards: [
      {
        title: "Comfort for Sunny Rooms",
        description:
          "Window film helps manage heat and glare where direct sun makes a room harder to enjoy."
      },
      {
        title: "Commercial Glass Performance",
        description:
          "Office and storefront films can support comfort, privacy, and a more usable work environment."
      },
      {
        title: "Glare Control",
        description:
          "Film can soften harsh light on screens, work surfaces, seating areas, and customer-facing spaces."
      },
      {
        title: "Interior Protection",
        description:
          "A practical layer of protection helps reduce the effect of daily sun exposure on interior finishes."
      },
      {
        title: "Privacy Options",
        description:
          "Selected films can add discretion for offices, meeting rooms, bathrooms, or street-facing windows."
      },
      {
        title: "Clean Appearance",
        description:
          "Window film improves performance while preserving a simple, uncluttered look at the glass."
      }
    ]
  },
  {
    title: "Exterior Window Coverings",
    slug: "exterior-solutions",
    href: "/gallery/exterior-solutions",
    summary:
      "Exterior shades, screens, and awnings that add comfort, UV protection, and polished outdoor appeal.",
    detailIntro:
      "Exterior window coverings help make outdoor and sun-facing spaces more comfortable while adding a finished look to the property. From exterior shades and screens to awnings, Perfect Shade offers solutions that help manage sunlight, improve comfort, and support the way you use your home or business.",
    eyebrow: "Outdoor shade",
    icon: "EX",
    image: {
      src: "/images/perfect-shade/exterior-solutions.jpg",
      alt: "Outdoor patio with retractable awning and exterior solar shade solution"
    },
    items: ["Shades", "Screens", "Awnings", "Comfort", "UV Protection", "Outdoor Appeal"],
    highlights: [
      {
        title: "Exterior Shades",
        description:
          "Exterior shades help manage sun exposure before it reaches the glass or outdoor living area."
      },
      {
        title: "Screens",
        description:
          "Screens can add comfort, privacy, and filtered light for patios, windows, and exterior-facing spaces."
      },
      {
        title: "Awnings",
        description:
          "Awnings create shade, improve outdoor usability, and add a polished architectural detail."
      },
      {
        title: "UV Protection",
        description:
          "Exterior solutions help reduce harsh sun exposure while supporting comfort and curb appeal."
      }
    ],
    galleryCards: [
      {
        title: "Patio Comfort",
        description:
          "Exterior shade helps patios and seating areas feel more usable during bright, warm parts of the day."
      },
      {
        title: "Sun-Facing Windows",
        description:
          "Exterior coverings help manage sunlight before it reaches windows, rooms, and work areas."
      },
      {
        title: "Screens for Filtered Light",
        description:
          "Exterior screens can soften light, add privacy, and support comfort without fully closing off a space."
      },
      {
        title: "Awnings with Presence",
        description:
          "Awnings add shade and a finished look for patios, entries, storefronts, and outdoor gathering areas."
      },
      {
        title: "Outdoor Appeal",
        description:
          "The right exterior solution should look intentional from the street and useful from the inside."
      },
      {
        title: "Practical Sun Management",
        description:
          "Exterior shades, screens, and awnings can help reduce glare, heat, and direct UV exposure."
      }
    ]
  }
];

export const galleryCategories = services.map((service) => ({
  title: service.title,
  slug: service.slug,
  href: service.href,
  description: service.summary,
  image: service.image
}));
