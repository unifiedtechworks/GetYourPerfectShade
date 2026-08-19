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

function nonblank<T extends Readonly<{ description: string }>>(
  rows: readonly T[],
): readonly T[] {
  return rows.filter((row) => Boolean(row.description.trim()));
}

export function EstimatePreview({ estimate }: { estimate: PreviewEstimate }) {
  const sections = new Set(visibleProposalSections(estimate));
  const scopeItems = nonblank(estimate.scopeItems);
  const addenda = nonblank(estimate.addenda);
  const terms = nonblank(estimate.terms);
  const pricingLines = nonblank(estimate.pricingLines);
  const alternatePricingLines = nonblank(estimate.alternatePricingLines);
  const hasSalesTax = BigInt(estimate.totals.salesTaxMinor) !== 0n;

  return (
    <article className={styles.document}>
      <div className={styles.draftBanner}>
        {estimate.status === "draft"
          ? "Draft preview - not a final document"
          : `${estimate.status} estimate preview`}
      </div>

      <header className={styles.proposalHeader}>
        <p className={styles.brandName}>PERFECT SHADE LLC</p>
        <p className={styles.proposalType}>{estimate.documentType.toUpperCase()}</p>
        <div className={styles.headerColumns}>
          <address className={styles.companyBlock}>
            <span>Perfect Shade LLC</span>
            <span>Sheri Brannan</span>
            <span>133 Pine Tree Avenue</span>
            <span>Umatilla, Oregon 97882</span>
            <span>Oregon CCB 250146</span>
            <span>Washington CCB PREFESL768Q</span>
            <span>Email: ps.perfectshade@gmail.com</span>
            <span>Phone: 541-571-4675</span>
            <span>Website: getyourperfectshade.com</span>
          </address>
          <dl className={styles.headerMetadata}>
            <div><dt>Bid No.</dt><dd>{estimate.estimateNumber}</dd></div>
            <div><dt>Prepared</dt><dd>{estimate.estimateDate}</dd></div>
            <div><dt>Valid Through</dt><dd>{estimate.validThrough}</dd></div>
            <div><dt>Status</dt><dd>{estimate.status.toUpperCase()} · Revision {estimate.revisionNumber}</dd></div>
          </dl>
        </div>
      </header>

      <section>
        <h2>Bid Information</h2>
        <table className={styles.bidInformation}>
          <tbody>
            {[
              ["Bid Due", estimate.bidDue],
              ["Project", estimate.projectName],
              ["Location", estimate.projectLocation],
              ["Architect", estimate.preparedFor],
              ["Owner", estimate.contactInformation],
            ].map(([label, value]) => (
              <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Scope of Work</h2>
        <p>Provide all materials and installation for window coverings for {estimate.projectName.trim() || "this project"}.</p>
        {scopeItems.length > 0 && (
          <ul>{scopeItems.map((item) => <li key={item.sortOrder}>{item.description}</li>)}</ul>
        )}
      </section>

      {sections.has("addenda") && (
        <section>
          <h2>Addenda Acknowledgement</h2>
          <p>Perfect Shade has acknowledged the following addenda:</p>
          <ul>{addenda.map((item) => <li key={item.sortOrder}>{item.description}</li>)}</ul>
        </section>
      )}

      <section>
        <h2>Pricing</h2>
        <table className={styles.pricingTable}>
          <thead><tr><th>Description</th><th>Amount</th></tr></thead>
          <tbody>
            {pricingLines.map((line) => (
              <tr key={line.sortOrder}><td>{line.description}</td><td>{money(line.amountMinor)}</td></tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={styles.strongTotal}><th>Subtotal</th><td>{money(estimate.totals.subtotalMinor)}</td></tr>
            {hasSalesTax && (
              <tr><th>Sales Tax ({estimate.taxRatePercent}%)</th><td>{money(estimate.totals.salesTaxMinor)}</td></tr>
            )}
            <tr className={styles.strongTotal}><th>Total</th><td>{money(estimate.totals.totalMinor)}</td></tr>
            <tr className={styles.lightTotal}><th>Required Deposit</th><td>{money(estimate.totals.requiredDepositMinor)}</td></tr>
            <tr className={`${styles.lightTotal} ${styles.boldTotal}`}><th>Balance Due</th><td>{money(estimate.totals.remainingBalanceMinor)}</td></tr>
          </tfoot>
        </table>
      </section>

      {sections.has("alternates") && (
        <section>
          <h2>Alternate Pricing</h2>
          <table className={styles.pricingTable}>
            <thead><tr><th>Description</th><th>Amount</th></tr></thead>
            <tbody>
              {alternatePricingLines.map((line) => (
                <tr key={line.sortOrder}><td>{line.description}</td><td>{money(line.amountMinor)}</td></tr>
              ))}
            </tbody>
            <tfoot><tr className={styles.strongTotal}><th>Alternate Total</th><td>{money(estimate.totals.alternateTotalMinor)}</td></tr></tfoot>
          </table>
          <p>Alternate pricing is provided for consideration only and is not included in the base bid total unless accepted in writing.</p>
        </section>
      )}

      <section>
        <h2>Terms</h2>
        <ul>{coreTerms(estimate).map((term) => <li key={term}>{term}</li>)}</ul>
        {sections.has("additionalTerms") && (
          <>
            <p className={styles.inlineLabel}>Additional terms or exclusions:</p>
            <ul>{terms.map((item) => <li key={item.sortOrder}>{item.description}</li>)}</ul>
          </>
        )}
      </section>

      {sections.has("prevailingWage") && (
        <section><h2>Prevailing Wage</h2><p>{estimate.prevailingWageStatement.trim()}</p></section>
      )}

      <section><h2>Measurement Readiness</h2><p>{MEASUREMENT_READINESS_TEXT}</p></section>
      <section><h2>Craftsmanship Warranty</h2><p>{CRAFTSMANSHIP_WARRANTY_TEXT}</p></section>
      <section><h2>Company Qualifications</h2><p>{COMPANY_QUALIFICATIONS_TEXT}</p></section>

      {sections.has("projectNotes") && (
        <section><h2>Project Notes</h2><p>Project Notes: {estimate.projectNotes}</p></section>
      )}

      <section className={styles.authorizationSection}>
        <h2>Authorization and Acceptance</h2>
        <p>By signing below, the client acknowledges acceptance of the scope, pricing, and terms described in this proposal.</p>
        <div className={styles.signatureColumns}>
          <div>
            <p className={styles.signatureLabel}>Perfect Shade Authorized Signature</p>
            <p className={styles.signatureLabel}>Sheri Brannan</p>
            <div className={styles.signatureSpace} aria-hidden="true" />
            <div className={styles.signatureLine} />
            <p>Date:</p>
          </div>
          <div>
            <p className={styles.signatureLabel}>Authorized Signature</p>
            <div className={styles.clientSignatureSpace} aria-hidden="true" />
            <div className={styles.signatureLine} />
            <p className={styles.signatureLabel}>Date:</p>
          </div>
        </div>
      </section>

      <footer className={styles.documentFooter}>Perfect Shade LLC | {estimate.documentType}</footer>
    </article>
  );
}
