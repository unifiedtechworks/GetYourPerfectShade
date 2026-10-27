import type { EstimateDetail } from "../aws/api/estimate-contracts";

export const DEFAULT_PREVAILING_WAGE_STATEMENT =
  "Applicable prevailing wage labor rates are included where required by the project.";

export const SALES_TAX_NOTICE_TEXT =
  "Applicable sales tax will be added unless a valid tax exemption certificate is provided.";

export const RETAINAGE_TERM_TEXT =
  "Maximum retainage shall be limited to 5% of the contract amount unless otherwise agreed in writing.";

export const LEGACY_PROPOSAL_POLICY_VERSION = "1" as const;
export const CURRENT_PROPOSAL_POLICY_VERSION = "2" as const;
export const LEAD_TIMES_TEXT =
  "Lead time will be 3 weeks from final measure and receipt of deposit.";

export function formatIssuedDateInPacific(
  estimate: Pick<EstimateDetail, "status" | "issuedAt">,
): string {
  if (estimate.status !== "issued" || !estimate.issuedAt) return "";
  const issuedAt = new Date(estimate.issuedAt);
  if (!Number.isFinite(issuedAt.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).formatToParts(issuedAt);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const month = value("month");
  const day = value("day");
  const year = value("year");
  return month && day && year ? `${month}/${day}/${year}` : "";
}

export const MEASUREMENT_READINESS_TEXT =
  "Measurement Readiness: Final measurements should not be requested or scheduled until the project area is ready, accessible, and reasonably prepared for accurate measuring. If there are questions about site readiness, mounting conditions, product requirements, or any other measurement-related requirements, Customer/Contractor should contact Perfect Shade LLC before requesting or scheduling final measurements. Additional trips, re-measures, or delays caused by incomplete site conditions, inaccessible areas, unclear requirements, construction changes, or other conditions outside Perfect Shade LLC’s control may result in additional charges.";

export const CRAFTSMANSHIP_WARRANTY_TEXT =
  "Perfect Shade provides a one-year craftsmanship warranty on installation labor. This warranty covers defects in workmanship under normal use and does not cover product defects, misuse, damage by others, changes to surrounding construction, or conditions outside Perfect Shade’s control.";

export const COMPANY_QUALIFICATIONS_TEXT =
  "Perfect Shade LLC is a locally owned and operated window covering company serving commercial, healthcare, municipal, educational, multifamily, and professional facilities throughout Eastern Oregon and Eastern Washington. We routinely assist with value engineering, product coordination, dependable project execution, and clean professional installation. Our lead installer has more than 15 years of experience installing window coverings throughout the Tri-Cities and surrounding region. References are available upon request.";

export const PROPOSAL_SECTION_ORDER = [
  "project",
  "scope",
  "addenda",
  "pricing",
  "alternates",
  "terms",
  "additionalTerms",
  "prevailingWage",
  "leadTimes",
  "measurementReadiness",
  "warranty",
  "qualifications",
  "projectNotes",
] as const;

type EstimatePresentationData = Pick<
  EstimateDetail,
  | "depositPercent"
  | "pricingValidDays"
  | "leadTime"
  | "proposalPolicyVersion"
  | "addenda"
  | "includeAlternatePricing"
  | "alternatePricingLines"
  | "terms"
  | "includePrevailingWageStatement"
  | "prevailingWageStatement"
  | "projectNotes"
>;

export function coreTerms(estimate: EstimatePresentationData): readonly string[] {
  const terms = [
    `${estimate.depositPercent}% deposit required prior to ordering materials.`,
    "Balance due upon substantial completion.",
  ];
  const pricingValidDays = estimate.pricingValidDays.trim();
  if (pricingValidDays) {
    terms.push(`Pricing is valid for ${pricingValidDays} days unless otherwise stated.`);
  }
  terms.push("Changes to the approved scope of work may result in additional charges.");
  if (estimate.proposalPolicyVersion === LEGACY_PROPOSAL_POLICY_VERSION) {
    const leadTime = estimate.leadTime.trim().replace(/[.\s]+$/g, "");
    if (leadTime) terms.push(`Estimated lead time: ${leadTime}.`);
  }
  terms.push(SALES_TAX_NOTICE_TEXT, RETAINAGE_TERM_TEXT);
  return terms;
}

export function visibleProposalSections(
  estimate: EstimatePresentationData,
): readonly string[] {
  return PROPOSAL_SECTION_ORDER.filter((section) => {
    if (section === "addenda") {
      return estimate.addenda.some((item) => Boolean(item.description.trim()));
    }
    if (section === "alternates") {
      return estimate.includeAlternatePricing
        && estimate.alternatePricingLines.length > 0;
    }
    if (section === "additionalTerms") {
      return estimate.terms.some((item) => Boolean(item.description.trim()));
    }
    if (section === "prevailingWage") {
      return estimate.includePrevailingWageStatement
        && Boolean(estimate.prevailingWageStatement.trim());
    }
    if (section === "leadTimes") {
      return estimate.proposalPolicyVersion === CURRENT_PROPOSAL_POLICY_VERSION;
    }
    if (section === "projectNotes") return Boolean(estimate.projectNotes.trim());
    return true;
  });
}
