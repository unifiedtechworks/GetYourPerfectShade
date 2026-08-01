import Image from "next/image";
import Link from "next/link";
import styles from "./ProductCard.module.css";

type ProductCategory = {
  title: string;
  href: string;
  environment: string;
  description: string;
  image: {
    src: string;
    alt: string;
    objectPosition?: string;
  };
};

type ProductCardProps = {
  category: ProductCategory;
  eager?: boolean;
  headingLevel?: "h2" | "h3";
};

export function ProductCard({
  category,
  eager = false,
  headingLevel = "h3"
}: ProductCardProps) {
  const Heading = headingLevel;

  return (
    <Link className={styles.card} href={category.href} aria-label={`Explore ${category.title}`}>
      <div className={styles.imageWrap}>
        <span className={styles.environment}>{category.environment}</span>
        <Image
          src={category.image.src}
          alt={category.image.alt}
          fill
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          sizes="(max-width: 860px) calc(100vw - 32px), (max-width: 1200px) calc((100vw - 76px) / 3), 358px"
          className={styles.image}
          style={{ objectPosition: category.image.objectPosition ?? "center" }}
        />
      </div>
      <div className={styles.body}>
        <Heading className={styles.title}>{category.title}</Heading>
        <p>{category.description}</p>
        <span className={styles.cardAction}>Explore options</span>
      </div>
    </Link>
  );
}
