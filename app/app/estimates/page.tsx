import Link from "next/link";
import { createEstimateApiClient } from "@/lib/aws/api/estimate-client";
import type { EstimateListItem } from "@/lib/aws/api/estimate-contracts";
import { requireEstimateApiIdentity } from "@/lib/aws/api/estimate-identity";
import { formatCurrencyFromMinorUnits } from "@/lib/estimates/calculations";
import styles from "./estimates.module.css";

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const { accessToken } = await requireEstimateApiIdentity();
  let estimates: EstimateListItem[] = [];
  let loadFailed = false;
  try {
    const result = await createEstimateApiClient({ accessToken }).list();
    estimates = [...result.data];
  } catch {
    loadFailed = true;
  }
  const { created } = await searchParams;

  return (
    <>
      <div className={styles.headingRow}>
        <div>
          <h1>Estimates</h1>
          <p className={styles.intro}>
            Create, review, and edit organization-owned draft estimates.
          </p>
        </div>
        <Link className={styles.primaryButton} href="/app/estimates/new">
          New estimate
        </Link>
      </div>

      {created && (
        <p className={styles.success} role="status">
          Draft estimate created.
        </p>
      )}
      {loadFailed && (
        <p className={styles.error} role="alert">
          Estimates could not be loaded. Please try again.
        </p>
      )}

      {!loadFailed && estimates.length === 0 ? (
        <section className={styles.empty}>
          <h2>No estimates yet</h2>
          <p>Create the first protected draft for this organization.</p>
        </section>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Project</th>
                <th>Architect</th>
                <th>Type</th>
                <th>Status</th>
                <th>Total</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {estimates.map((estimate) => (
                <tr key={estimate.id}>
                  <td>
                    <Link
                      className={styles.estimateLink}
                      href={`/app/estimates/${encodeURIComponent(estimate.id)}`}
                    >
                      {estimate.projectName}
                    </Link>
                    {estimate.estimateNumber && (
                      <span className={styles.secondary}>
                        Bid #{estimate.estimateNumber}
                      </span>
                    )}
                  </td>
                  <td>{estimate.preparedFor}</td>
                  <td>{estimate.documentType}</td>
                  <td className={styles.status}>{estimate.status}</td>
                  <td>
                    {formatCurrencyFromMinorUnits(BigInt(estimate.totalMinor))}
                  </td>
                  <td>{new Date(estimate.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
