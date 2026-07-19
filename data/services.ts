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
    title: string;
    description: string;
    image: {
      src: string;
      alt: string;
    };
  }[];
};

type ProductOffering = {
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
    items: ["Roller Shades", "Cellular Shades", "Roman Shades", "Blinds", "Draperies", "Motorization"],
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
        title: "Roller Shades",
        description:
          "Clean shade options for everyday privacy, filtered light, and a streamlined finished look.",
        image: productImages.rollerShades
      },
      {
        title: "Cellular / Honeycomb Shades",
        description:
          "Soft, energy-conscious products that help rooms feel more comfortable while maintaining privacy.",
        image: productImages.cellularHoneycombShades
      },
      {
        title: "Roman Shades",
        description:
          "Tailored fabric shades that add texture, warmth, and a polished design detail.",
        image: productImages.romanShades
      },
      {
        title: "Blinds",
        description:
          "Classic adjustable coverings for flexible privacy, light control, and practical daily use.",
        image: productImages.blinds
      },
      {
        title: "Draperies",
        description:
          "Custom fabric treatments that add softness, height, color, and a finished designer feel.",
        image: productImages.draperies
      },
      {
        title: "Motorized Window Coverings",
        description:
          "Convenient controls that make daily shade adjustments easier for homes and commercial spaces.",
        image: productImages.motorizedWindowCoverings
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
        title: "Exterior Shades",
        description:
          "Outdoor shade products for patios, windows, and sun-facing areas that need better comfort.",
        image: productImages.exteriorShades
      },
      {
        title: "Solar Screens",
        description:
          "Exterior screen options that soften harsh light while keeping the property looking clean.",
        image: productImages.solarScreens
      },
      {
        title: "Awnings",
        description:
          "Shade structures for patios, entries, storefronts, and outdoor gathering areas.",
        image: productImages.awnings
      },
      {
        title: "Patio Comfort",
        description:
          "Exterior solutions that help seating and gathering areas feel more usable during bright parts of the day.",
        image: productImages.exteriorShades
      },
      {
        title: "Sun-Facing Windows",
        description:
          "Products selected to manage sunlight before it reaches interior rooms or work areas.",
        image: productImages.solarScreens
      },
      {
        title: "Commercial Exterior Shade",
        description:
          "Professional options for businesses that want comfort, curb appeal, and a polished presentation.",
        image: productImages.commercialWindowCoveringSolutions
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
    title: "Roller Shades",
    href: "/gallery/window-coverings",
    description:
      "Clean, versatile shades for everyday light control, privacy, and a simple finished look.",
    image: productImages.rollerShades
  },
  {
    title: "Cellular / Honeycomb Shades",
    href: "/gallery/window-coverings",
    description:
      "Energy-conscious shades designed to soften light, add privacy, and help rooms feel more comfortable.",
    image: productImages.cellularHoneycombShades
  },
  {
    title: "Roman Shades",
    href: "/gallery/window-coverings",
    description:
      "Soft fabric shades that bring warmth, texture, and a tailored design finish to the room.",
    image: productImages.romanShades
  },
  {
    title: "Blinds",
    href: "/gallery/window-coverings",
    description:
      "Classic adjustable window coverings for flexible privacy, light control, and practical everyday use.",
    image: productImages.blinds
  },
  {
    title: "Draperies",
    href: "/gallery/window-coverings",
    description:
      "Custom fabric treatments that add softness, height, color, and a finished designer feel.",
    image: productImages.draperies
  },
  {
    title: "Motorized Window Coverings",
    href: "/gallery/window-coverings",
    description:
      "Convenient shade control for hard-to-reach windows, daily routines, and modern comfort.",
    image: productImages.motorizedWindowCoverings
  },
  {
    title: "Exterior Shades",
    href: "/gallery/exterior-solutions",
    description:
      "Outdoor shade solutions that help manage sun exposure and improve comfort around patios and exterior-facing spaces.",
    image: productImages.exteriorShades
  },
  {
    title: "Solar Screens",
    href: "/gallery/exterior-solutions",
    description:
      "Exterior screen options that help reduce harsh sunlight while preserving a clean exterior look.",
    image: productImages.solarScreens
  },
  {
    title: "Awnings",
    href: "/gallery/exterior-solutions",
    description:
      "Shade structures that add comfort, curb appeal, and usable outdoor space.",
    image: productImages.awnings
  },
  {
    title: "Commercial Window Covering Solutions",
    href: "/gallery/window-coverings",
    description:
      "Professional solutions for offices, storefronts, meeting rooms, and commercial spaces that need privacy, durability, and polished presentation.",
    image: productImages.commercialWindowCoveringSolutions
  }
];
