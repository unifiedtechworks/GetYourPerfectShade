import { createEstimateHandlers } from "../estimates";
import { S3EstimateDocumentStorage } from "../estimates/document-storage";
import sheriSignaturePng from "../estimates/assets/sheri_signature.pssig";
import { RdsDataDatabase } from "../shared/rds-data";
import { generateEstimateDocument } from "../../lib/estimates/document-output";
import { createEstimateRuntimeHandler } from "./estimate-runtime";

export const handler = createEstimateRuntimeHandler({
  handlerFactory: (pendingDocumentStaleAfterMs) => createEstimateHandlers(
    new RdsDataDatabase(),
    new S3EstimateDocumentStorage(),
    process.env.ESTIMATE_INCLUDE_COMPANY_SIGNATURE === "true"
      ? (estimate, type, generatedAt) => generateEstimateDocument(
          estimate,
          type,
          generatedAt,
          { companySignaturePng: sheriSignaturePng },
        )
      : undefined,
    { pendingDocumentStaleAfterMs },
  ),
});
