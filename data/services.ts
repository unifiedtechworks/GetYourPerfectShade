export type Service = {
  title: string;
  productTitle: string;
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
  productCards: {
    slug: string;
    title: string;
    description: string;
    image: {
      src: string;
      alt: string;
    };
    benefits: string[];
    goodFor: string[];
  }[];
};

type ProductOffering = {
  slug: string;
  title: string;
  href: string;
  description: string;
  image: Service["image"];
};

const productImages = {
  rollerShades: {
    src: "/images/perfect-shade/products/roller-shades.jpg",
    alt: "Living room with clean roller shades filtering natural light"
  },
  cellularHoneycombShades: {
    src: "/images/perfect-shade/products/cellular-honeycomb-shades.jpg",
    alt: "Bedroom with cellular honeycomb shades adding privacy and soft light"
  },
  romanShades: {
    src: "/images/perfect-shade/products/roman-shades.jpg",
    alt: "Bedroom with tailored roman shades and soft drapery panels"
  },
  blinds: {
    src: "/images/perfect-shade/products/blinds.jpg",
    alt: "Living room with white blinds for adjustable light control"
  },
  draperies: {
    src: "/images/perfect-shade/products/draperies.jpg",
    alt: "Elegant living room with full-height custom draperies"
  },
  motorizedWindowCoverings: {
    src: "/images/perfect-shade/products/motorized-window-coverings.jpg",
    alt: "Living room with motorized roller shades across large windows"
  },
  exteriorShades: {
    src: "/images/perfect-shade/products/exterior-shades.jpg",
    alt: "Covered patio with exterior shades for sun control and comfort"
  },
  solarScreens: {
    src: "/images/perfect-shade/products/solar-screens.jpg",
    alt: "Outdoor patio with solar screens reducing harsh sunlight"
  },
  awnings: {
    src: "/images/perfect-shade/products/awnings.jpg",
    alt: "Patio seating area shaded by a retractable awning"
  },
  commercialWindowCoveringSolutions: {
    src: "/images/perfect-shade/products/commercial-window-covering-solutions.jpg",
    alt: "Conference room with commercial roller shades on large windows"
  }
};

export const services: Service[] = [
  {
    title: "Window Coverings",
    productTitle: "Window Covering Products",
    slug: "window-coverings",
    href: "/gallery/window-coverings",
    summary:
      "Custom roller shades, cellular shades, roman shades, blinds, draperies, and motorized options for privacy, light control, and everyday comfort.",
    detailIntro:
      "Interior window coverings should do more than finish a room. The right shades, blinds, or draperies can soften natural light, improve privacy, support comfort, and bring the entire space together. Perfect Shade helps homeowners and businesses compare styles, materials, and features without overwhelming the process.",
    eyebrow: "Interior comfort",
    icon: "WC",
    image: productImages.rollerShades,
    items: [
      "Roller Shades",
      "Cellular Shades",
      "Roman Shades",
      "Blinds",
      "Draperies",
      "Motorization",
      "Commercial Solutions"
    ],
    highlights: [
      {
        title: "Roller Shades",
        description:
          "Clean, versatile shades for everyday light control, privacy, and a simple finished look."
      },
      {
        title: "Cellular / Honeycomb Shades",
        description:
          "Energy-conscious shades designed to soften light, add privacy, and help rooms feel more comfortable."
      },
      {
        title: "Roman Shades",
        description:
          "Soft fabric shades that bring warmth, texture, and a tailored design finish to the room."
      },
      {
        title: "Motorized Window Coverings",
        description:
          "Convenient shade control for hard-to-reach windows, daily routines, and modern comfort."
      }
    ],
    productCards: [
      {
        slug: "roller-shades",
        title: "Roller Shades",
        description:
          "Clean shade options for everyday privacy, filtered light, and a streamlined finished look.",
        image: productImages.rollerShades,
        benefits: [
          "Simple, modern profile that works in bedrooms, living areas, offices, and commercial spaces.",
          "Helpful light filtering and privacy options without visually crowding the room.",
          "A practical choice for wide windows, repeated window openings, and everyday use."
        ],
        goodFor: ["Clean design", "Filtered light", "Privacy", "Wide windows"]
      },
      {
        slug: "cellular-honeycomb-shades",
        title: "Cellular / Honeycomb Shades",
        description:
          "Soft, energy-conscious products that help rooms feel more comfortable while maintaining privacy.",
        image: productImages.cellularHoneycombShades,
        benefits: [
          "Cellular construction helps add a soft insulating layer at the window.",
          "A warm, quiet look for bedrooms, living spaces, offices, and street-facing rooms.",
          "Available in options that balance daylight, comfort, and privacy."
        ],
        goodFor: ["Comfort", "Privacy", "Bedrooms", "Energy-conscious spaces"]
      },
      {
        slug: "roman-shades",
        title: "Roman Shades",
        description:
          "Tailored fabric shades that add texture, warmth, and a polished design detail.",
        image: productImages.romanShades,
        benefits: [
          "Adds fabric softness with a more tailored profile than full drapery panels.",
          "Works well when the window covering should be part of the room design.",
          "A refined choice for bedrooms, dining rooms, sitting areas, and statement windows."
        ],
        goodFor: ["Soft texture", "Tailored style", "Bedrooms", "Design-focused rooms"]
      },
      {
        slug: "blinds",
        title: "Blinds",
        description:
          "Classic adjustable coverings for flexible privacy, light control, and practical daily use.",
        image: productImages.blinds,
        benefits: [
          "Adjustable slats make it easy to shift between privacy, daylight, and view.",
          "A familiar, practical option for busy rooms and everyday routines.",
          "Well suited for spaces that need flexible control throughout the day."
        ],
        goodFor: ["Adjustable light", "Everyday privacy", "Busy rooms", "Practical control"]
      },
      {
        slug: "draperies",
        title: "Draperies",
        description:
          "Custom fabric treatments that add softness, height, color, and a finished designer feel.",
        image: productImages.draperies,
        benefits: [
          "Brings softness, color, texture, and a more finished feel to the room.",
          "Can be layered with shades or blinds for comfort, privacy, and style.",
          "A strong option when windows need visual height or a more custom look."
        ],
        goodFor: ["Layered design", "Softness", "Finished rooms", "Statement windows"]
      },
      {
        slug: "motorized-window-coverings",
        title: "Motorized Window Coverings",
        description:
          "Convenient controls that make daily shade adjustments easier for homes and commercial spaces.",
        image: productImages.motorizedWindowCoverings,
        benefits: [
          "Makes daily shade adjustments easier for large or hard-to-reach windows.",
          "Supports consistent light control for routines, comfort, and privacy.",
          "Useful in both homes and commercial spaces with multiple windows."
        ],
        goodFor: ["Convenience", "Large windows", "Hard-to-reach areas", "Commercial spaces"]
      },
      {
        slug: "commercial-window-covering-solutions",
        title: "Commercial Window Covering Solutions",
        description:
          "Professional solutions for offices, storefronts, meeting rooms, and commercial spaces that need privacy, durability, and polished presentation.",
        image: productImages.commercialWindowCoveringSolutions,
        benefits: [
          "Supports a polished, consistent look for offices, meeting rooms, and customer-facing areas.",
          "Helps manage privacy, glare, and light control in spaces used throughout the workday.",
          "Selected around practical needs like durability, daily operation, and professional presentation."
        ],
        goodFor: ["Offices", "Meeting rooms", "Storefronts", "Commercial interiors"]
      }
    ]
  },
  {
    title: "Exterior Window Coverings",
    productTitle: "Exterior Shade Solutions",
    slug: "exterior-solutions",
    href: "/gallery/exterior-solutions",
    summary:
      "Exterior shades, solar screens, and awnings that add comfort, UV protection, and polished outdoor appeal.",
    detailIntro:
      "Exterior window coverings help make outdoor and sun-facing spaces more comfortable while adding a finished look to the property. From exterior shades and solar screens to awnings, Perfect Shade offers solutions that help manage sunlight, improve comfort, and support the way you use your home or business.",
    eyebrow: "Outdoor shade",
    icon: "EX",
    image: productImages.exteriorShades,
    items: ["Exterior Shades", "Solar Screens", "Awnings", "Comfort", "UV Protection", "Outdoor Appeal"],
    highlights: [
      {
        title: "Exterior Shades",
        description:
          "Outdoor shade solutions that help manage sun exposure and improve comfort around patios and exterior-facing spaces."
      },
      {
        title: "Solar Screens",
        description:
          "Exterior screen options that help reduce harsh sunlight while preserving a clean exterior look."
      },
      {
        title: "Awnings",
        description:
          "Shade structures that add comfort, curb appeal, and usable outdoor space."
      },
      {
        title: "Commercial Window Covering Solutions",
        description:
          "Professional solutions for offices, storefronts, meeting rooms, and commercial spaces that need privacy, durability, and polished presentation."
      }
    ],
    productCards: [
      {
        slug: "exterior-shades",
        title: "Exterior Shades",
        description:
          "Outdoor shade products for patios, windows, and sun-facing areas that need better comfort.",
        image: productImages.exteriorShades,
        benefits: [
          "Helps manage sunlight before it reaches patios, porches, and sun-facing glass.",
          "Adds comfort while keeping outdoor spaces more usable during bright parts of the day.",
          "A polished option for homes and businesses that need practical sun control."
        ],
        goodFor: ["Patio comfort", "Sun-facing areas", "Outdoor living", "Heat and glare control"]
      },
      {
        slug: "solar-screens",
        title: "Solar Screens",
        description:
          "Exterior screen options that soften harsh light while keeping the property looking clean.",
        image: productImages.solarScreens,
        benefits: [
          "Softens harsh sunlight while preserving a clean exterior appearance.",
          "Helps reduce glare and bright exposure around outdoor seating or window areas.",
          "A practical choice when comfort matters but the space still needs an open feel."
        ],
        goodFor: ["Glare reduction", "Filtered outdoor light", "Patios", "Exterior windows"]
      },
      {
        slug: "awnings",
        title: "Awnings",
        description:
          "Shade structures for patios, entries, storefronts, and outdoor gathering areas.",
        image: productImages.awnings,
        benefits: [
          "Creates a defined shade zone for patios, entries, and gathering areas.",
          "Adds curb appeal and a more finished architectural presence.",
          "Helps make outdoor spaces feel more comfortable and intentional."
        ],
        goodFor: ["Patios", "Entries", "Outdoor seating", "Curb appeal"]
      },
      {
        slug: "patio-comfort",
        title: "Patio Comfort",
        description:
          "Exterior solutions that help seating and gathering areas feel more usable during bright parts of the day.",
        image: productImages.exteriorShades,
        benefits: [
          "Helps outdoor seating areas feel more comfortable during sunny hours.",
          "Supports shade planning for patios, covered spaces, and gathering areas.",
          "Can be matched to the way the space is used day to day."
        ],
        goodFor: ["Outdoor seating", "Gathering areas", "Bright patios", "Comfort planning"]
      },
      {
        slug: "sun-facing-windows",
        title: "Sun-Facing Windows",
        description:
          "Products selected to manage sunlight before it reaches interior rooms or work areas.",
        image: productImages.solarScreens,
        benefits: [
          "Helps manage sunlight before it reaches interior rooms or work areas.",
          "Useful for windows that contribute to heat, glare, or uncomfortable brightness.",
          "Supports comfort without making the window solution feel heavy."
        ],
        goodFor: ["Bright windows", "Heat control", "Glare control", "Work areas"]
      },
      {
        slug: "commercial-exterior-shade",
        title: "Commercial Exterior Shade",
        description:
          "Professional options for businesses that want comfort, curb appeal, and a polished presentation.",
        image: productImages.commercialWindowCoveringSolutions,
        benefits: [
          "Supports a polished exterior or customer-facing presentation.",
          "Helps manage comfort for offices, storefronts, patios, and commercial spaces.",
          "Selected around practical needs like glare, usability, privacy, and durability."
        ],
        goodFor: ["Businesses", "Storefronts", "Commercial patios", "Customer-facing spaces"]
      }
    ]
  }
];

export const productCategories = services.map((service) => ({
  title: service.productTitle,
  slug: service.slug,
  href: service.href,
  description: service.summary,
  image: service.image
}));

export const productOfferings: ProductOffering[] = [
  {
    slug: "roller-shades",
    title: "Roller Shades",
    href: "/gallery/window-coverings?product=roller-shades",
    description:
      "Clean, versatile shades for everyday light control, privacy, and a simple finished look.",
    image: productImages.rollerShades
  },
  {
    slug: "cellular-honeycomb-shades",
    title: "Cellular / Honeycomb Shades",
    href: "/gallery/window-coverings?product=cellular-honeycomb-shades",
    description:
      "Energy-conscious shades designed to soften light, add privacy, and help rooms feel more comfortable.",
    image: productImages.cellularHoneycombShades
  },
  {
    slug: "roman-shades",
    title: "Roman Shades",
    href: "/gallery/window-coverings?product=roman-shades",
    description:
      "Soft fabric shades that bring warmth, texture, and a tailored design finish to the room.",
    image: productImages.romanShades
  },
  {
    slug: "blinds",
    title: "Blinds",
    href: "/gallery/window-coverings?product=blinds",
    description:
      "Classic adjustable window coverings for flexible privacy, light control, and practical everyday use.",
    image: productImages.blinds
  },
  {
    slug: "draperies",
    title: "Draperies",
    href: "/gallery/window-coverings?product=draperies",
    description:
      "Custom fabric treatments that add softness, height, color, and a finished designer feel.",
    image: productImages.draperies
  },
  {
    slug: "motorized-window-coverings",
    title: "Motorized Window Coverings",
    href: "/gallery/window-coverings?product=motorized-window-coverings",
    description:
      "Convenient shade control for hard-to-reach windows, daily routines, and modern comfort.",
    image: productImages.motorizedWindowCoverings
  },
  {
    slug: "exterior-shades",
    title: "Exterior Shades",
    href: "/gallery/exterior-solutions?product=exterior-shades",
    description:
      "Outdoor shade solutions that help manage sun exposure and improve comfort around patios and exterior-facing spaces.",
    image: productImages.exteriorShades
  },
  {
    slug: "solar-screens",
    title: "Solar Screens",
    href: "/gallery/exterior-solutions?product=solar-screens",
    description:
      "Exterior screen options that help reduce harsh sunlight while preserving a clean exterior look.",
    image: productImages.solarScreens
  },
  {
    slug: "awnings",
    title: "Awnings",
    href: "/gallery/exterior-solutions?product=awnings",
    description:
      "Shade structures that add comfort, curb appeal, and usable outdoor space.",
    image: productImages.awnings
  },
  {
    slug: "commercial-window-covering-solutions",
    title: "Commercial Window Covering Solutions",
    href: "/gallery/window-coverings?product=commercial-window-covering-solutions",
    description:
      "Professional solutions for offices, storefronts, meeting rooms, and commercial spaces that need privacy, durability, and polished presentation.",
    image: productImages.commercialWindowCoveringSolutions
  }
];
