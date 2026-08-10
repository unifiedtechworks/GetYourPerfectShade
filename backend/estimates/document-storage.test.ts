import { describe, expect, it, vi } from "vitest";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { S3EstimateDocumentStorage } from "./document-storage";

class Sender {
  commands: unknown[] = [];
  responses: unknown[] = [];
  async send(command: unknown) {
    this.commands.push(command);
    return this.responses.shift() ?? {};
  }
}

describe("S3 estimate document adapter", () => {
  it("uploads private bucket objects with safe metadata and no ACL", async () => {
    const sender = new Sender();
    sender.responses = [{ VersionId: "version-1" }];
    const storage = new S3EstimateDocumentStorage(
      "placeholder-private-bucket",
      sender as unknown as S3Client,
    );
    const result = await storage.put({
      body: new Uint8Array([1, 2, 3]),
      checksumSha256: "a".repeat(64),
      contentType: "application/pdf",
      documentId: "55555555-5555-4555-8555-555555555555",
      estimateId: "22222222-2222-4222-8222-222222222222",
      key: "organizations/tenant/estimates/estimate/revisions/1/documents/document.pdf",
      revision: "1",
    });
    const command = sender.commands[0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).not.toHaveProperty("ACL");
    expect(command.input.Metadata).toEqual({
      documentid: "55555555-5555-4555-8555-555555555555",
      estimateid: "22222222-2222-4222-8222-222222222222",
      revision: "1",
      sha256: "a".repeat(64),
    });
    expect(result).toEqual({
      byteSize: 3,
      checksumSha256: "a".repeat(64),
      versionId: "version-1",
    });
  });

  it("checks recovery metadata and treats a missing object as absent", async () => {
    const sender = new Sender();
    sender.responses = [{ ContentLength: 3, Metadata: { sha256: "b".repeat(64) }, VersionId: "v2" }];
    const storage = new S3EstimateDocumentStorage(
      "placeholder-private-bucket",
      sender as unknown as S3Client,
    );
    await expect(storage.head("trusted/key.pdf")).resolves.toEqual({
      byteSize: 3,
      checksumSha256: "b".repeat(64),
      versionId: "v2",
    });
    expect(sender.commands[0]).toBeInstanceOf(HeadObjectCommand);

    const missing = new Sender();
    missing.send = vi.fn(async () => {
      throw Object.assign(new Error("not found"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
    });
    await expect(new S3EstimateDocumentStorage(
      "placeholder-private-bucket",
      missing as unknown as S3Client,
    ).head("trusted/missing.pdf")).resolves.toBeNull();
  });

  it("creates a five-minute attachment URL without exposing signing configuration", async () => {
    const sender = new Sender();
    const signer = vi.fn(async (
      _client: S3Client,
      _command: GetObjectCommand,
      _options: Readonly<{ expiresIn: number }>,
    ) => "https://download.example.test/signed");
    const storage = new S3EstimateDocumentStorage(
      "placeholder-private-bucket",
      sender as unknown as S3Client,
      signer,
    );
    await expect(storage.presignDownload({
      key: "trusted/key.pdf",
      filename: "Project résumé.pdf",
      contentType: "application/pdf",
    })).resolves.toBe("https://download.example.test/signed");
    const command = signer.mock.calls[0][1] as GetObjectCommand;
    expect(command.input.Key).toBe("trusted/key.pdf");
    expect(command.input.ResponseContentDisposition).toContain("attachment");
    expect(command.input.ResponseContentDisposition).toContain("UTF-8''Project%20r%C3%A9sum%C3%A9.pdf");
    expect(signer.mock.calls[0][2]).toEqual({ expiresIn: 300 });
  });
});
