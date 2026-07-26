"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { productOfferings, type Service } from "@/data/services";
import styles from "./ProductDetailPage.module.css";

export function ProductDetailPage({ service }: { service: Service }) {
  const searchParams = useSearchParams();
  const selectedSlug = searchParams.get("product");
  const product =
    service.productCards.find((card) => card.slug === selectedSlug) ?? service.productCards[0];
  const selectedProductIndex = productOfferings.findIndex((item) => item.slug === product.slug);
  const productIndex = selectedProductIndex >= 0 ? selectedProductIndex : 0;
  const previousProduct =
    productOfferings[(productIndex - 1 + productOfferings.length) % productOfferings.length];
  const nextProduct = productOfferings[(productIndex + 1) % productOfferings.length];

  return (
    <main className="section">
      <div className="container">
        <Link className={styles.backLink} href="/gallery">
          Back to Products Offered
        </Link>
        <nav className={styles.productNav} aria-label="Product navigation">
          <Link className={styles.productNavLink} href={previousProduct.href}>
            <span>
              <span aria-hidden="true">{"<-"}</span>
              Previous Product
            </span>
            <strong>{previousProduct.title}</strong>
          </Link>
          <Link className={styles.productNavLink} href={nextProduct.href}>
            <span>
              Next Product
              <span aria-hidden="true">{"->"}</span>
            </span>
            <strong>{nextProduct.title}</strong>
          </Link>
        </nav>
        <div className={styles.header}>
          <div>
            <p className="eyebrow">Products Offered</p>
            <h1>{product.title}</h1>
            <p>{product.description}</p>
          </div>
          <div className={styles.featureImage}>
            <Image
              src={product.image.src}
              alt={product.image.alt}
              fill
              sizes="(max-width: 860px) 100vw, 42vw"
              className={styles.image}
              style={{ objectPosition: product.image.objectPosition ?? "center" }}
            />
          </div>
        </div>
        {product.supportingImages.length > 0 ? (
          <section className={styles.supportingGallery} aria-label={`${product.title} supporting images`}>
            <div className={styles.supportingHeader}>
              <p className="eyebrow">Additional views</p>
              <h2>More ways to use this product.</h2>
            </div>
            <div className={styles.supportingGrid}>
              {product.supportingImages.map((image) => (
                <figure key={`${image.label}-${image.alt}`} className={styles.supportingImage}>
                  <div>
                    <Image
                      src={image.src}
                      alt={image.alt}
                      fill
                      sizes="(max-width: 700px) 100vw, 33vw"
                      className={styles.image}
                      style={{ objectPosition: image.objectPosition ?? "center" }}
                    />
                  </div>
                  {image.label ? <figcaption>{image.label}</figcaption> : null}
                </figure>
              ))}
            </div>
          </section>
        ) : null}
        <section className={styles.details} aria-labelledby="details-heading">
          <div>
            <p className="eyebrow">{service.eyebrow}</p>
            <h2 id="details-heading">Why customers choose {product.title.toLowerCase()}.</h2>
          </div>
          <div className={styles.benefitList}>
            {product.benefits.map((benefit) => (
              <article key={benefit}>
                <span aria-hidden="true" />
                <p>{benefit}</p>
              </article>
            ))}
          </div>
        </section>
        <section className={styles.goodFor} aria-labelledby="good-for-heading">
          <p className="eyebrow">Good for</p>
          <h2 id="good-for-heading">A strong fit for these needs.</h2>
          <ul>
            {product.goodFor.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className={styles.cta} aria-labelledby="products-cta-heading">
          <div>
            <p className="eyebrow">Need guidance?</p>
            <h2 id="products-cta-heading">See if this option is right for your space.</h2>
            <p>
              Perfect Shade can help you compare product options, finishes, and features
              during your consultation.
            </p>
          </div>
          <div className="buttonRow">
            <Link className="button buttonPrimary" href="/contact">
              Request a Consultation
            </Link>
            <Link className="button buttonLight" href="tel:5415714675">
              Call 541-571-4675
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
