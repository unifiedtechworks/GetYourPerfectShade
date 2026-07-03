import styles from "./SectionHeading.module.css";

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  intro?: string;
  id?: string;
};

export function SectionHeading({ eyebrow, title, intro, id }: SectionHeadingProps) {
  const headingId = id ?? `${eyebrow.toLowerCase().replace(/\s+/g, "-")}-heading`;

  return (
    <div className={styles.heading}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={headingId}>{title}</h2>
      {intro ? <p>{intro}</p> : null}
    </div>
  );
}
