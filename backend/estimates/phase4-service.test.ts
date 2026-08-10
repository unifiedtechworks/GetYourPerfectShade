import { describe, expect, it } from "vitest";
import type { EstimateDetail } from "../../lib/aws/api/estimate-contracts";
import type { GeneratedEstimateDocument } from "../../lib/estimates/document-output";
import type { EstimateDatabase, SqlRow, SqlStatement } from "./database";
import type {
  EstimateDocumentStorage,
  StoreEstimateDocumentInput,
  StoredEstimateDocument,
} from "./document-storage";
import { EstimatePhase4Service } from "./phase4-service";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const ESTIMATE_ID = "22222222-2222-4222-8222-222222222222";
const NEW_ESTIMATE_ID = "33333333-3333-4333-8333-333333333333";
const DOCUMENT_ID = "55555555-5555-4555-8555-555555555555";

const LOCK_ROW: SqlRow = {
  id: ESTIMATE_ID,
  project_id: "44444444-4444-4444-8444-444444444444",
  status: "draft",
  revision_number: "1",
  row_version: "4",
  project_name: "Atrium",
  prepared_for: "Morgan Architect",
  include_alternate_pricing: "false",
  include_prevailing_wage_statement: "false",
  prevailing_wage_statement: "Applicable prevailing wage labor rates are included where required by the project.",
  issued_at: null,
};

const DETAIL_ROW: SqlRow = {
  ...LOCK_ROW,
  customer_id: "66666666-6666-4666-8666-666666666666",
  customer_name: "Acme",
  document_type: "Bid Proposal",
  estimate_number: "B-100",
  estimate_date: "2026-08-09",
  valid_through: "2026-09-09",
  bid_due: "",
  project_location: "Portland",
  contact_information: "Owner",
  source_estimate_id: null,
  issued_by: null,
  deposit_percent: "50",
  tax_rate_percent: "0",
  lead_time: "4-6 weeks",
  pricing_valid_days: "30",
  project_notes: "",
  subtotal_minor: "10000",
  sales_tax_minor: "0",
  total_minor: "10000",
  required_deposit_minor: "5000",
  remaining_balance_minor: "5000",
  created_by: "subject",
  updated_by: "subject",
  created_at: "2026-08-09T00:00:00.000Z",
  updated_at: "2026-08-09T00:01:00.000Z",
};

function pendingDocument(overrides: SqlRow = {}): SqlRow {
  return {
    id: DOCUMENT_ID,
    estimate_id: ESTIMATE_ID,
    estimate_revision: "1",
    document_type: "pdf",
    state: "pending",
    object_key: `organizations/${ORGANIZATION_ID}/estimates/${ESTIMATE_ID}/revisions/1/documents/${DOCUMENT_ID}.pdf`,
    original_filename: "2026-08-09 - Atrium - Perfect Shade Bid.pdf",
    content_type: "application/pdf",
    byte_size: "3",
    checksum_sha256: "a".repeat(64),
    source_row_version: "4",
    rendered_at: "2026-08-09T12:00:00.000Z",
    generated_at: null,
    created_at: "2026-08-09T12:00:00.000Z",
    ...overrides,
  };
}

class FakeDatabase implements EstimateDatabase {
  statements: SqlStatement[] = [];
  commits = 0;
  rollbacks = 0;
  transaction = 0;
  membershipRows: readonly SqlRow[] = [{
    actor_id: "subject",
    organization_id: ORGANIZATION_ID,
    role: "staff",
  }];
  commandInsertRows: readonly SqlRow[] = [{ id: "command-id" }];
  commandExistingRows: readonly SqlRow[] = [];
  lockRows: readonly SqlRow[] = [LOCK_ROW];
  countRows: readonly SqlRow[] = [{ base_count: "1", alternate_count: "0" }];
  issueRows: readonly SqlRow[] = [{
    issued_at: "2026-08-09T12:00:00.000Z",
    row_version: "5",
  }];
  issueResultRows: readonly SqlRow[] = [{
    status: "issued",
    issued_at: "2026-08-09T12:00:00.000Z",
    row_version: "5",
  }];
  existingRevisionRows: readonly SqlRow[] = [];
  detailRows: readonly SqlRow[] = [DETAIL_ROW];
  scopeRows: readonly SqlRow[] = [{ sort_order: "0", description: "Install shades" }];
  pricingRows: readonly SqlRow[] = [{ kind: "base", sort_order: "0", description: "Base", amount_minor: "10000" }];
  termRows: readonly SqlRow[] = [];
  addendaRows: readonly SqlRow[] = [];
  documentInsertRows: readonly SqlRow[] = [pendingDocument()];
  documentReservationRows: readonly SqlRow[] = [pendingDocument()];
  finalizeRows: readonly SqlRow[] = [pendingDocument({
    state: "ready",
    generated_at: "2026-08-09T12:00:00.000Z",
  })];
  listDocumentRows: readonly SqlRow[] = [];
  downloadRows: readonly SqlRow[] = [];
  failOn = "";

  async beginTransaction() { return `tx-${++this.transaction}`; }

  async execute(statement: SqlStatement): Promise<readonly SqlRow[]> {
    this.statements.push(statement);
    if (this.failOn && statement.sql.includes(this.failOn)) throw new Error("forced database failure");
    const sql = statement.sql;
    if (sql.includes("establish_estimate_context")) return this.membershipRows;
    if (sql.includes("insert into app.estimate_command_idempotency")) return this.commandInsertRows;
    if (sql.includes("select request_hash") && sql.includes("estimate_command_idempotency")) return this.commandExistingRows;
    if (sql.includes("select status, issued_at::text")) return this.issueResultRows;
    if (sql.includes("count(*) filter")) return this.countRows;
    if (sql.includes("set status = 'issued'")) return this.issueRows;
    if (sql.includes("source_estimate_id = :estimateId")) return this.existingRevisionRows;
    if (sql.includes("join app.projects")) return this.detailRows;
    if (sql.includes("from app.estimate_scope_items") && sql.trimStart().startsWith("select")) return this.scopeRows;
    if (sql.includes("from app.estimate_pricing_lines") && sql.trimStart().startsWith("select")) return this.pricingRows;
    if (sql.includes("from app.estimate_terms") && sql.trimStart().startsWith("select")) return this.termRows;
    if (sql.includes("from app.estimate_addenda") && sql.trimStart().startsWith("select")) return this.addendaRows;
    if (sql.includes("insert into app.estimate_documents")) return this.documentInsertRows;
    if (sql.includes("idempotency_key = :idempotencyKey") && sql.includes("from app.estimate_documents")) return this.documentReservationRows;
    if (sql.includes("set state = 'ready'")) return this.finalizeRows;
    if (sql.includes("order by created_at desc") && sql.includes("estimate_documents")) return this.listDocumentRows;
    if (sql.includes("and state = 'ready'") && sql.includes("object_key")) return this.downloadRows;
    if (sql.includes("from app.estimates") && sql.includes("project_id::text")) return this.lockRows;
    return [];
  }

  async commitTransaction() { this.commits += 1; }
  async rollbackTransaction() { this.rollbacks += 1; }
}

class FakeStorage implements EstimateDocumentStorage {
  headResult: StoredEstimateDocument | null = null;
  putResult: StoredEstimateDocument = {
    byteSize: 3,
    checksumSha256: "a".repeat(64),
    versionId: "version-1",
  };
  puts: StoreEstimateDocumentInput[] = [];
  presigns: { key: string; filename: string; contentType: string }[] = [];
  putFails = false;

  async head() { return this.headResult; }
  async put(input: StoreEstimateDocumentInput) {
    this.puts.push(input);
    if (this.putFails) throw new Error("S3 unavailable");
    return this.putResult;
  }
  async presignDownload(input: { key: string; filename: string; contentType: string }) {
    this.presigns.push(input);
    return "https://documents.example.test/short-lived";
  }
}

const GENERATED: GeneratedEstimateDocument = {
  bytes: new Uint8Array([1, 2, 3]),
  checksumSha256: "a".repeat(64),
  contentType: "application/pdf",
  filename: "2026-08-09 - Atrium - Perfect Shade Bid.pdf",
  type: "pdf",
};

function service(
  database: FakeDatabase,
  storage = new FakeStorage(),
  firstId = NEW_ESTIMATE_ID,
) {
  return new EstimatePhase4Service(
    database,
    storage,
    (() => {
      const ids = [firstId, "77777777-7777-4777-8777-777777777777"];
      return () => ids.shift() ?? "88888888-8888-4888-8888-888888888888";
    })(),
    () => new Date("2026-08-09T12:00:00.000Z"),
    async (_estimate: EstimateDetail, _type, _date) => GENERATED,
  );
}

describe("Phase 4 issue workflow", () => {
  it("issues a complete draft, records audit, and commits atomically", async () => {
    const database = new FakeDatabase();
    const result = await service(database).issue("subject", ESTIMATE_ID, "issue-key-123456", "request-id");
    expect(result.data).toMatchObject({ status: "issued", rowVersion: "5", replayed: false });
    expect(database.statements.some((statement) => statement.sql.includes("estimate.issued") || statement.parameters?.some((p) => p.value === "estimate.issued"))).toBe(true);
    expect(database.commits).toBe(1);
    expect(database.rollbacks).toBe(0);
  });

  it("rejects incomplete drafts without changing status", async () => {
    const database = new FakeDatabase();
    database.countRows = [{ base_count: "0", alternate_count: "0" }];
    await expect(service(database).issue("subject", ESTIMATE_ID, "issue-key-123456", "request-id"))
      .rejects.toMatchObject({ code: "estimate_incomplete", status: 400 });
    expect(database.statements.some((statement) => statement.sql.includes("set status = 'issued'"))).toBe(false);
    expect(database.rollbacks).toBe(1);
  });

  it("rejects a second issue and replays the original idempotent command", async () => {
    const second = new FakeDatabase();
    second.lockRows = [{ ...LOCK_ROW, status: "issued" }];
    await expect(service(second).issue("subject", ESTIMATE_ID, "new-issue-key-123456", "request-id"))
      .rejects.toMatchObject({ code: "estimate_already_issued", status: 409 });

    const replay = new FakeDatabase();
    replay.commandInsertRows = [];
    replay.commandExistingRows = [{
      request_hash: "d3f8fd2bcf802c7bf430c370a36361f6411076990008671d95116f2c7d6e44b4",
      estimate_id: ESTIMATE_ID,
      result_id: ESTIMATE_ID,
    }];
    // Capture the exact hash from the attempted insert rather than coupling to implementation JSON.
    const capture = new FakeDatabase();
    capture.failOn = "select id::text, project_id::text";
    await expect(service(capture).issue("subject", ESTIMATE_ID, "issue-key-123456", "request-id")).rejects.toThrow();
    const hash = capture.statements.find((statement) => statement.sql.includes("insert into app.estimate_command_idempotency"))!
      .parameters!.find((parameter) => parameter.name === "requestHash")!.value;
    replay.commandExistingRows = [{ request_hash: hash, estimate_id: ESTIMATE_ID, result_id: ESTIMATE_ID }];
    await expect(service(replay).issue("subject", ESTIMATE_ID, "issue-key-123456", "request-id"))
      .resolves.toMatchObject({ data: { status: "issued", replayed: true } });
  });
});

describe("Phase 4 revision and duplication", () => {
  it("creates a linked next draft revision and copies all ordered content", async () => {
    const database = new FakeDatabase();
    database.lockRows = [{ ...LOCK_ROW, status: "issued", revision_number: "2" }];
    const result = await service(database).createRevision("subject", ESTIMATE_ID, "revision-key-123456", "request-id");
    expect(result.data).toMatchObject({
      estimateId: NEW_ESTIMATE_ID,
      sourceEstimateId: ESTIMATE_ID,
      revisionNumber: "3",
      status: "draft",
    });
    const sql = database.statements.map((statement) => statement.sql).join("\n");
    expect(sql).toContain("source_estimate_id");
    expect(sql).toContain("insert into app.estimate_scope_items");
    expect(sql).toContain("insert into app.estimate_pricing_lines");
    expect(sql).toContain("insert into app.estimate_terms");
    expect(sql).toContain("insert into app.estimate_addenda");
    expect(sql).not.toContain("insert into app.estimate_documents");
    expect(database.commits).toBe(1);
  });

  it("duplicates into an independent revision-one draft with a blank estimate number", async () => {
    const database = new FakeDatabase();
    database.lockRows = [{ ...LOCK_ROW, status: "issued" }];
    const result = await service(database).duplicate("subject", ESTIMATE_ID, "duplicate-key-123456", "request-id");
    expect(result.data).toMatchObject({ sourceEstimateId: null, revisionNumber: "1", status: "draft" });
    const insert = database.statements.find((statement) =>
      statement.sql.includes("select :newEstimateId::uuid") && statement.sql.includes("null, 1"),
    );
    expect(insert?.sql).toContain("'draft', e.document_type, ''");
    expect(database.statements.some((statement) => statement.sql.includes("estimate_documents"))).toBe(false);
  });

  it("fails closed before reading an estimate for a missing or cross-tenant membership", async () => {
    const database = new FakeDatabase();
    database.membershipRows = [];
    await expect(service(database).duplicate("other-subject", ESTIMATE_ID, "duplicate-key-123456", "request-id"))
      .rejects.toMatchObject({ code: "active_membership_required", status: 403 });
    expect(database.statements.some((statement) => statement.sql.includes("from app.estimates"))).toBe(false);
  });
});

describe("Phase 4 generated document recovery and download", () => {
  it("stores under the trusted tenant key, finalizes metadata, and audits", async () => {
    const database = new FakeDatabase();
    const storage = new FakeStorage();
    const result = await service(database, storage, DOCUMENT_ID).generate(
      "subject", ESTIMATE_ID, "pdf", "document-key-123456", "request-id",
    );
    expect(storage.puts).toHaveLength(1);
    expect(storage.puts[0].key).toBe(pendingDocument().object_key);
    expect(storage.puts[0].key).not.toContain("Atrium");
    expect(result.data).toMatchObject({ type: "pdf", state: "ready", checksumSha256: "a".repeat(64) });
    expect(database.statements.some((statement) => statement.parameters?.some((p) => p.value === "estimate.document_generated"))).toBe(true);
  });

  it("marks upload failure explicitly and does not produce a ready history row", async () => {
    const database = new FakeDatabase();
    const storage = new FakeStorage();
    storage.putFails = true;
    await expect(service(database, storage, DOCUMENT_ID).generate(
      "subject", ESTIMATE_ID, "pdf", "document-key-123456", "request-id",
    )).rejects.toMatchObject({ code: "document_storage_unavailable", status: 503 });
    expect(database.statements.some((statement) => statement.sql.includes("set state = 'failed'"))).toBe(true);
    expect(database.statements.some((statement) => statement.sql.includes("set state = 'ready'"))).toBe(false);
  });

  it("recovers an uploaded pending object on idempotent replay without uploading again", async () => {
    const database = new FakeDatabase();
    database.documentInsertRows = [];
    const storage = new FakeStorage();
    storage.headResult = storage.putResult;
    const result = await service(database, storage, DOCUMENT_ID).generate(
      "subject", ESTIMATE_ID, "pdf", "document-key-123456", "request-id",
    );
    expect(storage.puts).toHaveLength(0);
    expect(result.data.replayed).toBe(true);
    expect(result.data.state).toBe("ready");
  });

  it("authorizes metadata before creating a short-lived download and hides the key", async () => {
    const database = new FakeDatabase();
    database.downloadRows = [{
      id: DOCUMENT_ID,
      original_filename: "proposal.pdf",
      content_type: "application/pdf",
      object_key: pendingDocument().object_key,
    }];
    const storage = new FakeStorage();
    const result = await service(database, storage).download("subject", ESTIMATE_ID, DOCUMENT_ID);
    expect(storage.presigns).toEqual([{
      key: pendingDocument().object_key,
      filename: "proposal.pdf",
      contentType: "application/pdf",
    }]);
    expect(result.data.downloadUrl).toContain("short-lived");
    expect(result.data).not.toHaveProperty("objectKey");

    const denied = new FakeDatabase();
    denied.downloadRows = [];
    await expect(service(denied).download("subject", ESTIMATE_ID, DOCUMENT_ID))
      .rejects.toMatchObject({ code: "document_not_found", status: 404 });
  });
});
