export type ProductImage = {
  src: string;
  alt: string;
  label?: string;
  objectPosition?: string;
};

export type Service = {
  title: string;
  productTitle: string;
  slug: string;
  href: string;
  summary: string;
  detailIntro: string;
  eyebrow: string;
  icon: string;
  image: ProductImage;
  items: string[];
  highlights: {
    title: string;
    description: string;
  }[];
  productCards: {
    slug: string;
    title: string;
    description: string;
    image: ProductImage;
    supportingImages: ProductImage[];
    benefits: string[];
    goodFor: string[];
  }[];
};

type ProductOffering = {
  slug: string;
  title: string;
  href: string;
  environment: string;
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

const supportingProductImages = {
  rollerShades: [
    {
      src: "/images/perfect-shade/products/supporting/roller-shades-support-kitchen-nook.jpg",
      alt: "Roller shades in a bright kitchen and breakfast nook",
      label: "Kitchen nook"
    },
    {
      src: "/images/perfect-shade/products/supporting/roller-shades-support-fabric-detail.jpg",
      alt: "Close view of a woven roller shade with wrapped cassette and straight hem bar",
      label: "Fabric and fit"
    },
    {
      src: "/images/perfect-shade/products/supporting/roller-shades-support-operating-states.jpg",
      alt: "Three roller shades raised, partially lowered, and fully lowered in a family room",
      label: "Operating states"
    }
  ],
  cellularHoneycombShades: [
    {
      src: "/images/perfect-shade/products/supporting/cellular-honeycomb-shades-support-closeup.jpg",
      alt: "Close-up of cellular honeycomb shades filtering soft bedroom light",
      label: "Close-up detail"
    },
    {
      src: "/images/perfect-shade/products/supporting/cellular-honeycomb-shades-support-nursery-top-down.jpg",
      alt: "Top-down bottom-up cellular shades balancing daylight and privacy in a nursery",
      label: "Top-down privacy"
    },
    {
      src: "/images/perfect-shade/products/supporting/cellular-honeycomb-shades-support-cell-detail.jpg",
      alt: "Detailed view of the layered honeycomb cells and bottom rail of a cellular shade",
      label: "Cell construction"
    }
  ],
  romanShades: [
    {
      src: "/images/perfect-shade/products/supporting/roman-shades-support-dining-nook.jpg",
      alt: "Roman shades in a warm dining nook",
      label: "Dining nook"
    },
    {
      src: "/images/perfect-shade/products/supporting/roman-shades-support-linen-fold-detail.jpg",
      alt: "Close view of tailored linen Roman shade folds, lining, and stitched edges",
      label: "Tailored folds"
    },
    {
      src: "/images/perfect-shade/products/supporting/roman-shades-support-raised-bedroom.jpg",
      alt: "Raised Roman shades stacked neatly above three guest bedroom windows",
      label: "Raised position"
    }
  ],
  blinds: [
    {
      src: "/images/perfect-shade/products/supporting/blinds-support-kitchen.jpg",
      alt: "Horizontal blinds in a bright kitchen with adjustable light control",
      label: "Kitchen light control"
    },
    {
      src: "/images/perfect-shade/products/supporting/blinds-support-home-office.jpg",
      alt: "Light wood blinds tilted to different angles in a contemporary home office",
      label: "Adjustable light"
    },
    {
      src: "/images/perfect-shade/products/supporting/blinds-support-slat-detail.jpg",
      alt: "Close view of horizontal blind slats, ladder tapes, and bottom rail",
      label: "Slat detail"
    }
  ],
  draperies: [
    {
      src: "/images/perfect-shade/products/supporting/draperies-support-bedroom.jpg",
      alt: "Layered draperies in a soft elegant bedroom",
      label: "Bedroom layers"
    },
    {
      src: "/images/perfect-shade/products/supporting/draperies-support-pleat-detail.jpg",
      alt: "Close view of dusty rose pinch-pleat drapery fabric on brass track hardware",
      label: "Pleat and textile"
    },
    {
      src: "/images/perfect-shade/products/supporting/draperies-support-closed-dining-room.jpg",
      alt: "Full-height draperies closed for evening privacy in a dining room",
      label: "Closed for privacy"
    }
  ],
  motorizedWindowCoverings: [
    {
      src: "/images/perfect-shade/products/supporting/motorized-window-coverings-support-tall-windows.jpg",
      alt: "Motorized shades on tall living room windows",
      label: "Tall windows"
    },
    {
      src: "/images/perfect-shade/products/supporting/motorized-window-coverings-support-synchronized-living-room.jpg",
      alt: "Motorized roller shades at synchronized heights with an unbranded remote nearby",
      label: "Synchronized control"
    },
    {
      src: "/images/perfect-shade/products/supporting/motorized-window-coverings-support-recessed-headrail.jpg",
      alt: "Close view of a recessed cordless motorized shade installation above a large window",
      label: "Recessed installation"
    }
  ],
  exteriorShades: [
    {
      src: "/images/perfect-shade/products/supporting/exterior-shades-support-patio-dining.jpg",
      alt: "Exterior shades on a covered patio dining area",
      label: "Patio dining"
    },
    {
      src: "/images/perfect-shade/products/supporting/exterior-shades-support-residential-facade.jpg",
      alt: "Exterior shades in raised and lowered positions across a covered residential porch",
      label: "Raised and lowered"
    },
    {
      src: "/images/perfect-shade/products/supporting/exterior-shades-support-track-detail.jpg",
      alt: "Close view of exterior shade mesh secured in a weather-resistant side track",
      label: "Track and mesh"
    }
  ],
  solarScreens: [
    {
      src: "/images/perfect-shade/products/supporting/solar-screens-support-home-exterior.jpg",
      alt: "Solar screens on sun-facing home windows",
      label: "Home exterior"
    },
    {
      src: "/images/perfect-shade/products/supporting/solar-screens-support-mesh-detail.jpg",
      alt: "Detailed view through solar-screen mesh toward a softened sunlit landscape",
      label: "Mesh detail"
    },
    {
      src: "/images/perfect-shade/products/supporting/solar-screens-support-commercial-exterior.jpg",
      alt: "Exterior solar screens in raised and lowered positions on commercial windows",
      label: "Commercial exterior"
    }
  ],
  awnings: [
    {
      src: "/images/perfect-shade/products/supporting/awnings-support-coastal-patio.jpg",
      alt: "Retractable awning over a bright outdoor patio",
      label: "Outdoor patio"
    },
    {
      src: "/images/perfect-shade/products/supporting/awnings-support-retracted-cassette.jpg",
      alt: "Retractable awning folded into a compact cassette above patio doors",
      label: "Retracted position"
    },
    {
      src: "/images/perfect-shade/products/supporting/awnings-support-storefront.jpg",
      alt: "Extended navy awnings shading outdoor tables at a small-town storefront",
      label: "Storefront shade"
    }
  ],
  commercialWindowCoveringSolutions: [
    {
      src: "/images/perfect-shade/products/supporting/commercial-window-coverings-support-executive-office.jpg",
      alt: "Commercial office with window coverings for light control",
      label: "Executive office"
    },
    {
      src: "/images/perfect-shade/products/supporting/commercial-window-coverings-support-conference-room.jpg",
      alt: "Commercial roller shades managing light across a modern conference room",
      label: "Conference room"
    },
    {
      src: "/images/perfect-shade/products/supporting/commercial-window-coverings-support-lobby.jpg",
      alt: "Translucent commercial solar shades filtering daylight in a professional lobby",
      label: "Public lobby"
    }
  ]
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
        supportingImages: supportingProductImages.rollerShades,
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
        supportingImages: supportingProductImages.cellularHoneycombShades,
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
        supportingImages: supportingProductImages.romanShades,
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
        supportingImages: supportingProductImages.blinds,
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
        supportingImages: supportingProductImages.draperies,
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
        supportingImages: supportingProductImages.motorizedWindowCoverings,
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
        supportingImages: supportingProductImages.commercialWindowCoveringSolutions,
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
        supportingImages: supportingProductImages.exteriorShades,
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
        supportingImages: supportingProductImages.solarScreens,
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
        supportingImages: supportingProductImages.awnings,
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
        supportingImages: supportingProductImages.exteriorShades,
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
        supportingImages: supportingProductImages.solarScreens,
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
        supportingImages: supportingProductImages.commercialWindowCoveringSolutions,
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
    environment: "Modern living room",
    description:
      "Clean, versatile shades for everyday light control, privacy, and a simple finished look.",
    image: productImages.rollerShades
  },
  {
    slug: "cellular-honeycomb-shades",
    title: "Cellular / Honeycomb Shades",
    href: "/gallery/window-coverings?product=cellular-honeycomb-shades",
    environment: "Bedroom comfort",
    description:
      "Energy-conscious shades designed to soften light, add privacy, and help rooms feel more comfortable.",
    image: productImages.cellularHoneycombShades
  },
  {
    slug: "roman-shades",
    title: "Roman Shades",
    href: "/gallery/window-coverings?product=roman-shades",
    environment: "Tailored bedroom",
    description:
      "Soft fabric shades that bring warmth, texture, and a tailored design finish to the room.",
    image: productImages.romanShades
  },
  {
    slug: "blinds",
    title: "Blinds",
    href: "/gallery/window-coverings?product=blinds",
    environment: "Family room light",
    description:
      "Classic adjustable window coverings for flexible privacy, light control, and practical everyday use.",
    image: productImages.blinds
  },
  {
    slug: "draperies",
    title: "Draperies",
    href: "/gallery/window-coverings?product=draperies",
    environment: "Elegant living space",
    description:
      "Custom fabric treatments that add softness, height, color, and a finished designer feel.",
    image: productImages.draperies
  },
  {
    slug: "motorized-window-coverings",
    title: "Motorized Window Coverings",
    href: "/gallery/window-coverings?product=motorized-window-coverings",
    environment: "Contemporary large windows",
    description:
      "Convenient shade control for hard-to-reach windows, daily routines, and modern comfort.",
    image: productImages.motorizedWindowCoverings
  },
  {
    slug: "exterior-shades",
    title: "Exterior Shades",
    href: "/gallery/exterior-solutions?product=exterior-shades",
    environment: "Covered patio",
    description:
      "Outdoor shade solutions that help manage sun exposure and improve comfort around patios and exterior-facing spaces.",
    image: productImages.exteriorShades
  },
  {
    slug: "solar-screens",
    title: "Solar Screens",
    href: "/gallery/exterior-solutions?product=solar-screens",
    environment: "Sunny exterior windows",
    description:
      "Exterior screen options that help reduce harsh sunlight while preserving a clean exterior look.",
    image: productImages.solarScreens
  },
  {
    slug: "awnings",
    title: "Awnings",
    href: "/gallery/exterior-solutions?product=awnings",
    environment: "Patio or deck shade",
    description:
      "Shade structures that add comfort, curb appeal, and usable outdoor space.",
    image: productImages.awnings
  },
  {
    slug: "commercial-window-covering-solutions",
    title: "Commercial Window Covering Solutions",
    href: "/gallery/window-coverings?product=commercial-window-covering-solutions",
    environment: "Commercial interior",
    description:
      "Professional solutions for offices, storefronts, meeting rooms, and commercial spaces that need privacy, durability, and polished presentation.",
    image: productImages.commercialWindowCoveringSolutions
  }
];
