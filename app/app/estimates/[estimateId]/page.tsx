import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createEstimateApiClient,
  EstimateApiError,
} from "@/lib/aws/api/estimate-client";
import { requireEstimateApiIdentity } from "@/lib/aws/api/estimate-identity";
import { EstimateEditor } from "./EstimateEditor";
import { EstimatePhase4Actions } from "./EstimatePhase4Actions";
import styles from "../estimates.module.css";

export default async function EstimateEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ estimateId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { estimateId } = await params;
  const { created } = await searchParams;
  const { accessToken } = await requireEstimateApiIdentity();
  try {
    const api = createEstimateApiClient({ accessToken });
    const result = await api.get(estimateId);
    let documents = [] as Awaited<ReturnType<typeof api.listDocuments>>["data"];
    let documentsUnavailable = false;
    try {
      documents = (await api.listDocuments(estimateId)).data;
    } catch {
      documentsUnavailable = true;
    }
    const {
      createdBy: _createdBy,
      updatedBy: _updatedBy,
      issuedBy: _issuedBy,
      ...editorEstimate
    } = result.data;
    return (
      <>
        <Link className={styles.backLink} href="/app/estimates">
          Back to estimates
        </Link>
        {created && (
          <p className={styles.success} role="status">
            Draft estimate created. Complete the remaining details and save.
          </p>
        )}
        <EstimatePhase4Actions
          documents={documents}
          documentsUnavailable={documentsUnavailable}
          estimateId={result.data.id}
          revisionNumber={result.data.revisionNumber}
          status={result.data.status}
        />
        <EstimateEditor estimate={editorEstimate} />
      </>
    );
  } catch (error) {
    if (error instanceof EstimateApiError && error.status === 404) notFound();
    return (
      <section className={styles.empty}>
        <h1>Estimate unavailable</h1>
        <p role="alert">
          The estimate could not be loaded. Please return to the estimate list
          and try again.
        </p>
        <Link className={styles.primaryButton} href="/app/estimates">
          Return to estimates
        </Link>
      </section>
    );
  }
}
