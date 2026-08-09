import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createEstimateApiClient,
  EstimateApiError,
} from "@/lib/aws/api/estimate-client";
import { requireEstimateApiIdentity } from "@/lib/aws/api/estimate-identity";
import { EstimatePreview } from "./EstimatePreview";
import { PrintPreviewButton } from "./PrintPreviewButton";
import styles from "./preview.module.css";

export default async function EstimatePreviewPage({
  params,
}: {
  params: Promise<{ estimateId: string }>;
}) {
  const { estimateId } = await params;
  const { accessToken } = await requireEstimateApiIdentity();
  try {
    const result = await createEstimateApiClient({ accessToken }).get(estimateId);
    const { createdBy: _createdBy, updatedBy: _updatedBy, ...previewEstimate } =
      result.data;
    return (
      <>
        <nav aria-label="Estimate preview actions" className={styles.actions}>
          <Link href={`/app/estimates/${encodeURIComponent(estimateId)}`}>
            Back to editor
          </Link>
          <PrintPreviewButton />
        </nav>
        <EstimatePreview estimate={previewEstimate} />
      </>
    );
  } catch (error) {
    if (error instanceof EstimateApiError && error.status === 404) notFound();
    return (
      <section className={styles.unavailable}>
        <h1>Preview unavailable</h1>
        <p role="alert">The saved estimate could not be loaded. Return to the editor and try again.</p>
        <Link href={`/app/estimates/${encodeURIComponent(estimateId)}`}>Return to editor</Link>
      </section>
    );
  }
}
