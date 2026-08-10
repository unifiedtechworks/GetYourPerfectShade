"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  createEstimateApiClient,
  EstimateApiError,
} from "@/lib/aws/api/estimate-client";
import type { EstimateDocumentType } from "@/lib/aws/api/estimate-contracts";
import { requireEstimateApiIdentity } from "@/lib/aws/api/estimate-identity";

export type EstimateCommandResult = Readonly<{
  ok: boolean;
  message: string;
  estimateId?: string;
  downloadUrl?: string;
}>;

function failure(error: unknown, fallback: string): EstimateCommandResult {
  if (error instanceof EstimateApiError) {
    return { ok: false, message: error.message };
  }
  return { ok: false, message: fallback };
}

async function client() {
  const { accessToken } = await requireEstimateApiIdentity();
  return createEstimateApiClient({ accessToken });
}

export async function issueEstimateAction(
  estimateId: string,
): Promise<EstimateCommandResult> {
  try {
    await (await client()).issue(estimateId, randomUUID());
    revalidatePath("/app/estimates");
    revalidatePath(`/app/estimates/${estimateId}`);
    revalidatePath(`/app/estimates/${estimateId}/preview`);
    return { ok: true, message: "Estimate issued and frozen." };
  } catch (error) {
    return failure(error, "The estimate could not be issued.");
  }
}

export async function duplicateEstimateAction(
  estimateId: string,
): Promise<EstimateCommandResult> {
  try {
    const result = await (await client()).duplicate(estimateId, randomUUID());
    revalidatePath("/app/estimates");
    return {
      ok: true,
      message: "Independent draft created.",
      estimateId: result.data.estimateId,
    };
  } catch (error) {
    return failure(error, "The estimate could not be duplicated.");
  }
}

export async function createRevisionAction(
  estimateId: string,
): Promise<EstimateCommandResult> {
  try {
    const result = await (await client()).createRevision(estimateId, randomUUID());
    revalidatePath("/app/estimates");
    return {
      ok: true,
      message: `Revision ${result.data.revisionNumber} draft created.`,
      estimateId: result.data.estimateId,
    };
  } catch (error) {
    return failure(error, "The revision could not be created.");
  }
}

export async function generateEstimateDocumentAction(
  estimateId: string,
  type: EstimateDocumentType,
): Promise<EstimateCommandResult> {
  try {
    const result = await (await client()).generateDocument(
      estimateId,
      type,
      randomUUID(),
    );
    revalidatePath(`/app/estimates/${estimateId}`);
    return {
      ok: true,
      message: `${result.data.filename} generated.`,
    };
  } catch (error) {
    return failure(error, `The ${type.toUpperCase()} document could not be generated.`);
  }
}

export async function getEstimateDocumentDownloadAction(
  estimateId: string,
  documentId: string,
): Promise<EstimateCommandResult> {
  try {
    const result = await (await client()).getDocumentDownload(
      estimateId,
      documentId,
    );
    return {
      ok: true,
      message: `Download ready for ${result.data.filename}.`,
      downloadUrl: result.data.downloadUrl,
    };
  } catch (error) {
    return failure(error, "The download could not be authorized.");
  }
}
