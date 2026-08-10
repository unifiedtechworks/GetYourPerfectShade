"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type {
  EstimateDocumentRecord,
  EstimateDocumentType,
  EstimateStatus,
} from "@/lib/aws/api/estimate-contracts";
import {
  createRevisionAction,
  duplicateEstimateAction,
  generateEstimateDocumentAction,
  getEstimateDocumentDownloadAction,
  issueEstimateAction,
  type EstimateCommandResult,
} from "../phase4-actions";
import styles from "../estimates.module.css";

function hasUnsavedEditorChanges(): boolean {
  return document.querySelector("[data-estimate-editor]")?.getAttribute("data-dirty") === "true";
}

export function EstimatePhase4Actions({
  estimateId,
  status,
  revisionNumber,
  documents,
  documentsUnavailable,
}: Readonly<{
  estimateId: string;
  status: EstimateStatus;
  revisionNumber: string;
  documents: readonly EstimateDocumentRecord[];
  documentsUnavailable: boolean;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState("");
  const [result, setResult] = useState<EstimateCommandResult | null>(null);

  function run(
    label: string,
    operation: () => Promise<EstimateCommandResult>,
    options: Readonly<{ confirm?: string; requireSavedDraft?: boolean; navigate?: boolean }> = {},
  ) {
    if (options.requireSavedDraft && hasUnsavedEditorChanges()) {
      setResult({ ok: false, message: "Save the draft before using this action." });
      return;
    }
    if (options.confirm && !window.confirm(options.confirm)) return;
    setActive(label);
    setResult(null);
    startTransition(async () => {
      const next = await operation();
      setResult(next);
      setActive("");
      if (next.ok && options.navigate && next.estimateId) {
        router.push(`/app/estimates/${encodeURIComponent(next.estimateId)}`);
        return;
      }
      if (next.ok && next.downloadUrl) {
        window.location.assign(next.downloadUrl);
        return;
      }
      if (next.ok) router.refresh();
    });
  }

  function generate(type: EstimateDocumentType) {
    run(
      `generate-${type}`,
      () => generateEstimateDocumentAction(estimateId, type),
      { requireSavedDraft: status === "draft" },
    );
  }

  return (
    <section className={styles.outputPanel} aria-labelledby="estimate-output-heading">
      <div className={styles.outputHeading}>
        <div>
          <h2 id="estimate-output-heading">Output and lifecycle</h2>
          <p>
            {status === "draft" ? "Editable draft" : "Frozen issued estimate"}
            {` · Revision ${revisionNumber}`}
          </p>
        </div>
        <div className={styles.commandButtons}>
          <button
            className={styles.secondaryButton}
            disabled={pending}
            onClick={() => generate("docx")}
            type="button"
          >
            {active === "generate-docx" ? "Generating…" : "Generate DOCX"}
          </button>
          <button
            className={styles.secondaryButton}
            disabled={pending}
            onClick={() => generate("pdf")}
            type="button"
          >
            {active === "generate-pdf" ? "Generating…" : "Generate PDF"}
          </button>
          <button
            className={styles.secondaryButton}
            disabled={pending}
            onClick={() => generate("json")}
            type="button"
          >
            {active === "generate-json" ? "Exporting…" : "Export JSON"}
          </button>
          <button
            className={styles.secondaryButton}
            disabled={pending}
            onClick={() => run(
              "duplicate",
              () => duplicateEstimateAction(estimateId),
              {
                confirm: "Create an independent draft copy? Its estimate number will be blank and generated documents will not be copied.",
                navigate: true,
                requireSavedDraft: status === "draft",
              },
            )}
            type="button"
          >
            {active === "duplicate" ? "Duplicating…" : "Duplicate"}
          </button>
          {status === "draft" ? (
            <button
              className={styles.issueButton}
              disabled={pending}
              onClick={() => run(
                "issue",
                () => issueEstimateAction(estimateId),
                {
                  confirm: "Issue this estimate? This revision will become read-only and cannot be edited.",
                  requireSavedDraft: true,
                },
              )}
              type="button"
            >
              {active === "issue" ? "Issuing…" : "Issue estimate"}
            </button>
          ) : status === "issued" ? (
            <button
              className={styles.primaryButton}
              disabled={pending}
              onClick={() => run(
                "revision",
                () => createRevisionAction(estimateId),
                {
                  confirm: "Create the next editable revision from this issued estimate?",
                  navigate: true,
                },
              )}
              type="button"
            >
              {active === "revision" ? "Creating…" : "Create revision"}
            </button>
          ) : null}
        </div>
      </div>

      {result && (
        <p className={result.ok ? styles.success : styles.error} role={result.ok ? "status" : "alert"}>
          {result.message}
        </p>
      )}

      <h3>Generated documents</h3>
      {documentsUnavailable ? (
        <p className={styles.warning} role="alert">
          Document history is temporarily unavailable.
        </p>
      ) : documents.length === 0 ? (
        <p className={styles.help}>No generated documents yet.</p>
      ) : (
        <div className={styles.documentTableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>File</th>
                <th>Revision</th>
                <th>State</th>
                <th>Generated</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((item) => (
                <tr key={item.id}>
                  <td>{item.filename}</td>
                  <td>{item.revisionNumber}</td>
                  <td className={styles.status}>{item.state}</td>
                  <td>{item.generatedAt ? new Date(item.generatedAt).toLocaleString() : "-"}</td>
                  <td>
                    {item.state === "ready" ? (
                      <button
                        className={styles.inlineButton}
                        disabled={pending}
                        onClick={() => run(
                          `download-${item.id}`,
                          () => getEstimateDocumentDownloadAction(estimateId, item.id),
                        )}
                        type="button"
                      >
                        {active === `download-${item.id}` ? "Authorizing…" : "Download"}
                      </button>
                    ) : (
                      <span className={styles.secondary}>Unavailable</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
