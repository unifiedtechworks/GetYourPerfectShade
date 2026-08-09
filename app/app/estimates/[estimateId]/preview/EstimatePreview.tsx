import type { EstimateDetail } from "../../../../../lib/aws/api/estimate-contracts";
import { formatCurrencyFromMinorUnits } from "../../../../../lib/estimates/calculations";
import {
  COMPANY_QUALIFICATIONS_TEXT,
  CRAFTSMANSHIP_WARRANTY_TEXT,
  MEASUREMENT_READINESS_TEXT,
  coreTerms,
  visibleProposalSections,
} from "../../../../../lib/estimates/presentation";
import styles from "./preview.module.css";

type PreviewEstimate = Omit<EstimateDetail, "createdBy" | "updatedBy">;

function money(value: string): string {
  return formatCurrencyFromMinorUnits(BigInt(value));
}

export function EstimatePreview({ estimate }: { estimate: PreviewEstimate }) {
  const sections = new Set(visibleProposalSections(estimate));

  return (
    <article className={styles.document}>
      <div className={styles.draftBanner}>
        {estimate.status === "draft"
          ? "Draft preview - not a final document"
          : `${estimate.status} estimate preview`}
      </div>
      <header className={styles.brandHeader}>
        <div>
          <p className={styles.brandName}>Perfect Shade LLC</p>
          <p>Sheri Brannan</p>
          <p>133 Pine Tree Avenue</p>
          <p>Umatilla, Oregon 97882</p>
        </div>
        <div>
          <p>Oregon CCB 250146</p>
          <p>Washington CCB PREFESL768Q</p>
          <p>ps.perfectshade@gmail.com</p>
          <p>541-571-4675</p>
          <p>getyourperfectshade.com</p>
        </div>
      </header>

      <h1>{estimate.documentType}</h1>
      <dl className={styles.metadata}>
        <div><dt>Project</dt><dd>{estimate.projectName}</dd></div>
        <div><dt>Bid Number</dt><dd>{estimate.estimateNumber || "-"}</dd></div>
        <div><dt>Location</dt><dd>{estimate.projectLocation || "-"}</dd></div>
        <div><dt>Bid Date</dt><dd>{estimate.estimateDate || "-"}</dd></div>
        <div><dt>Status</dt><dd>{estimate.status}</dd></div>
        <div><dt>Revision</dt><dd>{estimate.revisionNumber}</dd></div>
        <div><dt>Architect</dt><dd>{estimate.preparedFor}</dd></div>
        <div><dt>Bid Due</dt><dd>{estimate.bidDue || "-"}</dd></div>
        <div className={styles.wide}><dt>Owner</dt><dd>{estimate.contactInformation || "-"}</dd></div>
      </dl>

      <section>
        <h2>Scope of Work</h2>
        {estimate.scopeItems.length ? (
          <ul>{estimate.scopeItems.map((item) => <li key={item.sortOrder}>{item.description}</li>)}</ul>
        ) : (
          <p className={styles.muted}>No scope items have been saved.</p>
        )}
      </section>

      {sections.has("addenda") && (
        <section>
          <h2>Addenda Acknowledgement</h2>
          <ul>{estimate.addenda.map((item) => <li key={item.sortOrder}>{item.description}</li>)}</ul>
        </section>
      )}

      <section>
        <h2>Pricing</h2>
        <table>
          <thead><tr><th>Description</th><th>Amount</th></tr></thead>
          <tbody>
            {estimate.pricingLines.map((line) => (
              <tr key={line.sortOrder}><td>{line.description}</td><td>{money(line.amountMinor)}</td></tr>
            ))}
          </tbody>
          <tfoot>
            <tr><th>Subtotal</th><td>{money(estimate.totals.subtotalMinor)}</td></tr>
            <tr><th>Sales Tax (0%)</th><td>{money(estimate.totals.salesTaxMinor)}</td></tr>
            <tr><th>Total</th><td>{money(estimate.totals.totalMinor)}</td></tr>
            <tr><th>Required Deposit ({estimate.depositPercent}%)</th><td>{money(estimate.totals.requiredDepositMinor)}</td></tr>
            <tr><th>Remaining Balance</th><td>{money(estimate.totals.remainingBalanceMinor)}</td></tr>
          </tfoot>
        </table>
      </section>

      {sections.has("alternates") && (
        <section>
          <h2>Alternate Pricing</h2>
          <table>
            <tbody>
              {estimate.alternatePricingLines.map((line) => (
                <tr key={line.sortOrder}><td>{line.description}</td><td>{money(line.amountMinor)}</td></tr>
              ))}
            </tbody>
            <tfoot><tr><th>Alternate Total (separate)</th><td>{money(estimate.totals.alternateTotalMinor)}</td></tr></tfoot>
          </table>
          <p className={styles.muted}>Alternate pricing is excluded from the main estimate total.</p>
        </section>
      )}

      <section>
        <h2>Terms</h2>
        <ul>{coreTerms(estimate).map((term) => <li key={term}>{term}</li>)}</ul>
      </section>

      {sections.has("additionalTerms") && (
        <section>
          <h2>Additional Terms / Exclusions</h2>
          <ul>{estimate.terms.map((item) => <li key={item.sortOrder}>{item.description}</li>)}</ul>
        </section>
      )}

      {sections.has("prevailingWage") && (
        <section><h2>Prevailing Wage</h2><p>{estimate.prevailingWageStatement}</p></section>
      )}

      <section><h2>Measurement Readiness</h2><p>{MEASUREMENT_READINESS_TEXT}</p></section>
      <section><h2>One-Year Craftsmanship Warranty</h2><p>{CRAFTSMANSHIP_WARRANTY_TEXT}</p></section>
      <section><h2>Company Qualifications</h2><p>{COMPANY_QUALIFICATIONS_TEXT}</p></section>

      {sections.has("projectNotes") && (
        <section><h2>Project Notes</h2><p>{estimate.projectNotes}</p></section>
      )}
    </article>
  );
}
