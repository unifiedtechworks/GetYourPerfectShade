import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ESTIMATE_DOWNLOAD_TTL_SECONDS } from "../../lib/estimates/document-output";

export type StoreEstimateDocumentInput = Readonly<{
  body: Uint8Array;
  checksumSha256: string;
  contentType: string;
  documentId: string;
  estimateId: string;
  key: string;
  revision: string;
}>;

export type StoredEstimateDocument = Readonly<{
  byteSize: number;
  checksumSha256: string;
  versionId: string | null;
}>;

export interface EstimateDocumentStorage {
  head(key: string): Promise<StoredEstimateDocument | null>;
  put(input: StoreEstimateDocumentInput): Promise<StoredEstimateDocument>;
  presignDownload(input: Readonly<{
    contentType: string;
    filename: string;
    key: string;
  }>): Promise<string>;
}

type S3Sender = Readonly<{ send(command: unknown): Promise<unknown> }>;
type Signer = (
  client: S3Client,
  command: GetObjectCommand,
  options: Readonly<{ expiresIn: number }>,
) => Promise<string>;

function requiredBucketName(): string {
  const value = process.env.DOCUMENT_BUCKET_NAME?.trim();
  if (!value) throw new Error("Document storage configuration is unavailable.");
  return value;
}

function safeContentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export class S3EstimateDocumentStorage implements EstimateDocumentStorage {
  private readonly sender: S3Sender;

  constructor(
    private readonly bucketName = requiredBucketName(),
    client: S3Client = new S3Client({}),
    private readonly signer: Signer = getSignedUrl,
  ) {
    this.sender = client;
  }

  async head(key: string): Promise<StoredEstimateDocument | null> {
    try {
      const result = await this.sender.send(new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      })) as {
        ContentLength?: number;
        Metadata?: Record<string, string>;
        VersionId?: string;
      };
      const checksum = result.Metadata?.sha256;
      if (!checksum || !/^[0-9a-f]{64}$/.test(checksum)) return null;
      return {
        byteSize: result.ContentLength ?? 0,
        checksumSha256: checksum,
        versionId: result.VersionId ?? null,
      };
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      const name = (error as { name?: string }).name;
      if (status === 404 || name === "NotFound" || name === "NoSuchKey") return null;
      throw error;
    }
  }

  async put(input: StoreEstimateDocumentInput): Promise<StoredEstimateDocument> {
    const result = await this.sender.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      ChecksumSHA256: Buffer.from(input.checksumSha256, "hex").toString("base64"),
      Metadata: {
        documentid: input.documentId,
        estimateid: input.estimateId,
        revision: input.revision,
        sha256: input.checksumSha256,
      },
    })) as { VersionId?: string };
    return {
      byteSize: input.body.byteLength,
      checksumSha256: input.checksumSha256,
      versionId: result.VersionId ?? null,
    };
  }

  async presignDownload(input: Readonly<{
    contentType: string;
    filename: string;
    key: string;
  }>): Promise<string> {
    return this.signer(
      this.sender as S3Client,
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: input.key,
        ResponseContentDisposition: safeContentDisposition(input.filename),
        ResponseContentType: input.contentType,
      }),
      { expiresIn: ESTIMATE_DOWNLOAD_TTL_SECONDS },
    );
  }
}
