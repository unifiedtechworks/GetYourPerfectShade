import Link from "next/link";
import { requireOrganizationAccount } from "@/lib/auth/account";
import { formatCurrencyFromMinorUnits } from "@/lib/estimates/calculations";
import styles from "./estimates.module.css";

type EstimateRow = {
  id: string;
  document_type: string;
  estimate_number: string;
  project_name: string;
  prepared_for: string;
  status: string;
  total_minor: string | number;
  updated_at: string;
};

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const { supabase, organizationId } = await requireOrganizationAccount();
  const { data, error } = await supabase
    .from("estimates")
    .select(
      "id, document_type, estimate_number, project_name, prepared_for, status, total_minor, updated_at",
    )
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  const { created } = await searchParams;
  const estimates = (data ?? []) as EstimateRow[];

  return (
    <>
      <div className={styles.headingRow}>
        <div>
          <h1>Estimates</h1>
          <p className={styles.intro}>
            Organization-owned draft estimates. Editing and preview are planned
            for later phases.
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
      {error && (
        <p className={styles.error} role="alert">
          Estimates could not be loaded. Confirm the Phase 1 migration is applied.
        </p>
      )}

      {!error && estimates.length === 0 ? (
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
                    <strong>{estimate.project_name}</strong>
                    {estimate.estimate_number && (
                      <span className={styles.secondary}>
                        Bid #{estimate.estimate_number}
                      </span>
                    )}
                  </td>
                  <td>{estimate.prepared_for}</td>
                  <td>{estimate.document_type}</td>
                  <td className={styles.status}>{estimate.status}</td>
                  <td>
                    {formatCurrencyFromMinorUnits(BigInt(estimate.total_minor))}
                  </td>
                  <td>{new Date(estimate.updated_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
