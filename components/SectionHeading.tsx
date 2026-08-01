import styles from "./SectionHeading.module.css";

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  intro?: string;
  id?: string;
  level?: "h1" | "h2";
};

export function SectionHeading({
  eyebrow,
  title,
  intro,
  id,
  level = "h2"
}: SectionHeadingProps) {
  const headingId = id ?? `${eyebrow.toLowerCase().replace(/\s+/g, "-")}-heading`;
  const Heading = level;

  return (
    <div className={styles.heading}>
      <p className="eyebrow">{eyebrow}</p>
      <Heading id={headingId}>{title}</Heading>
      {intro ? <p>{intro}</p> : null}
    </div>
  );
}
