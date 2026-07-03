import styles from "./ProcessSteps.module.css";

const steps = [
  {
    title: "Call or message",
    text: "Share the space, goals, and timing so the right product direction is clear early."
  },
  {
    title: "Measure and guide",
    text: "Review light, privacy, heat, glare, and fit with practical product recommendations."
  },
  {
    title: "Install and support",
    text: "Finish the installation cleanly, explain operation, and stay available after the sale."
  }
];

export function ProcessSteps() {
  return (
    <section className="section sectionAlt waveSection" aria-labelledby="process-heading">
      <div className="container">
        <p className="eyebrow">Process</p>
        <h2 id="process-heading" className={styles.title}>
          From first call to finished installation.
        </h2>
        <div className={styles.steps}>
          {steps.map((step, index) => (
            <article key={step.title} className={styles.step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
