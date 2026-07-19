import Image from "next/image";
import Link from "next/link";
import styles from "./ProductCard.module.css";

type ProductCategory = {
  title: string;
  href: string;
  description: string;
  image: {
    src: string;
    alt: string;
  };
};

export function ProductCard({ category }: { category: ProductCategory }) {
  return (
    <article className={styles.card}>
      <div className={styles.imageWrap}>
        <Image
          src={category.image.src}
          alt={category.image.alt}
          fill
          sizes="(max-width: 860px) 100vw, 33vw"
          className={styles.image}
        />
      </div>
      <div className={styles.body}>
        <h3>{category.title}</h3>
        <p>{category.description}</p>
        <Link href={category.href}>Explore options</Link>
      </div>
    </article>
  );
}
