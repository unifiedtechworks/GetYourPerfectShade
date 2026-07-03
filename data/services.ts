export type Service = {
  title: string;
  slug: string;
  href: string;
  summary: string;
  eyebrow: string;
  icon: string;
  image: {
    src: string;
    alt: string;
  };
  items: string[];
};

export const services: Service[] = [
  {
    title: "Window Coverings",
    slug: "window-coverings",
    href: "/gallery/window-coverings",
    summary: "Custom interior treatments that balance style, privacy, and everyday light control.",
    eyebrow: "Interior comfort",
    icon: "WC",
    image: {
      src: "/images/perfect-shade/window-coverings.jpg",
      alt: "Elegant living room with custom drapery and light-filtering shade"
    },
    items: ["Shades", "Blinds", "Draperies", "Motorization"]
  },
  {
    title: "Window Films",
    slug: "window-films",
    href: "/gallery/window-films",
    summary: "Residential and commercial films to reduce heat, protect interiors, and add privacy.",
    eyebrow: "Performance glass",
    icon: "WF",
    image: {
      src: "/images/perfect-shade/window-films.jpg",
      alt: "Modern office with large windows suitable for heat and glare reducing window film"
    },
    items: ["Residential & Commercial", "Reduce Heat", "Protect", "Enhance Privacy"]
  },
  {
    title: "Exterior Window Coverings",
    slug: "exterior-solutions",
    href: "/gallery/exterior-solutions",
    summary: "Outdoor shade solutions for comfort, UV protection, and polished curb appeal.",
    eyebrow: "Outdoor shade",
    icon: "EX",
    image: {
      src: "/images/perfect-shade/exterior-solutions.jpg",
      alt: "Outdoor patio with retractable awning and exterior solar shade solution"
    },
    items: ["Shades", "Screens", "Awnings", "Comfort", "UV Protection"]
  }
];

export const galleryCategories = services.map((service) => ({
  title: service.title,
  slug: service.slug,
  href: service.href,
  description: service.summary,
  image: service.image
}));
